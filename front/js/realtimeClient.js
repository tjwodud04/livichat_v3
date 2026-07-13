// OpenAI Realtime API WebRTC client (GA protocol).
//
// Flow:
//   1. Fetch a short-lived ephemeral client secret from our backend.
//   2. Open an RTCPeerConnection, publish the mic track, add a data channel.
//   3. Exchange SDP with https://api.openai.com/v1/realtime/calls using the
//      ephemeral secret as the bearer token (no ?model= query param in GA — the
//      model is bound to the ephemeral secret).
//   4. React to Realtime server events on the data channel and drive lip sync.
//
// Endpoints, mic constraints, and lip-sync tuning come from constants.js
// (REALTIME_CONFIG / LIP_SYNC_CONFIG), which must load before this file.

class RealtimeClient {
    constructor(characterType = 'hiyori') {
        this.pc = null;               // RTCPeerConnection
        this.dc = null;               // DataChannel
        this.audioEl = null;          // Output audio element
        this.mediaStream = null;      // Microphone stream
        this.characterType = characterType;

        // Audio analysis for lip sync (fallback)
        this.audioAnalyser = null;
        this.visemeSmoother = new VisemeSmoother(LIP_SYNC_CONFIG.SMOOTHING);

        // Event-based lip sync state
        this._lipSyncAnimationId = null;
        this._lipSyncPhase = 0;
        this._lastAudioEventTime = 0;

        // State
        this.isConnected = false;
        this.isSpeaking = false;
        this.isListening = false;

        // Callbacks
        this.onTranscript = null;       // (text, role) => void
        this.onAudioStart = null;       // () => void
        this.onAudioEnd = null;         // () => void
        this.onConnectionChange = null; // (status) => void
        this.onVisemeUpdate = null;     // (visemes) => void
        this.onError = null;            // (error) => void
    }

    async connect() {
        try {
            this.onConnectionChange?.('connecting');

            // 1. Get an ephemeral client secret from the backend.
            const apiKey = localStorage.getItem('openai_api_key') || '';
            const response = await fetch(REALTIME_CONFIG.SESSION_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey,
                },
                body: JSON.stringify({ character: this.characterType }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to get session token');
            }

            const { client_secret } = await response.json();
            if (!client_secret || !client_secret.value) {
                throw new Error('Invalid session response');
            }

            // 2. Create the peer connection.
            this.pc = new RTCPeerConnection();

            // 3. Set up audio output.
            this.audioEl = document.createElement('audio');
            this.audioEl.autoplay = true;
            document.body.appendChild(this.audioEl);  // Must be in DOM for some browsers

            this.pc.ontrack = (e) => {
                console.log('[RealtimeClient] Received audio track');
                this.audioEl.srcObject = e.streams[0];

                // Initialize the audio analyser once playback starts.
                this.audioEl.onplaying = () => {
                    if (!this.audioAnalyser) {
                        this._initAudioAnalyser(this.audioEl);
                    }
                };
            };

            // 4. Get microphone input.
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: REALTIME_CONFIG.MIC_CONSTRAINTS,
            });
            this.pc.addTrack(this.mediaStream.getAudioTracks()[0]);

            // 5. Create the data channel for Realtime events.
            this.dc = this.pc.createDataChannel(REALTIME_CONFIG.DATA_CHANNEL_LABEL);
            this.dc.onmessage = this._handleServerEvent.bind(this);
            this.dc.onopen = () => {
                console.log('[RealtimeClient] DataChannel opened');
                this.isConnected = true;
                this.onConnectionChange?.('connected');
                this._startVisemeLoop();
            };
            this.dc.onclose = () => {
                console.log('[RealtimeClient] DataChannel closed');
                this.isConnected = false;
                this.onConnectionChange?.('disconnected');
            };

            // 6. Create and set the SDP offer.
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            // 7. Exchange SDP with OpenAI (GA calls endpoint, no model query param).
            const sdpResponse = await fetch(REALTIME_CONFIG.SDP_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${client_secret.value}`,
                    'Content-Type': 'application/sdp',
                },
                body: offer.sdp,
            });

            if (!sdpResponse.ok) {
                throw new Error(`SDP exchange failed: ${sdpResponse.status}`);
            }

            const answerSdp = await sdpResponse.text();
            await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

            console.log('[RealtimeClient] WebRTC connection established');
        } catch (error) {
            console.error('[RealtimeClient] Connection error:', error);
            this.onConnectionChange?.('error');
            this.onError?.(error);
            throw error;
        }
    }

    _handleServerEvent(event) {
        try {
            const data = JSON.parse(event.data);

            // Case labels list the GA event name first, with the retired beta
            // name kept as a fall-through alias for resilience.
            switch (data.type) {
                // User's speech transcription.
                case 'conversation.item.input_audio_transcription.completed':
                    console.log('[RealtimeClient] User said:', data.transcript);
                    this.onTranscript?.(data.transcript, 'user');
                    break;

                // AI response transcript (streaming) — accumulated by the UI elsewhere.
                case 'response.output_audio_transcript.delta':  // GA
                case 'response.audio_transcript.delta':         // beta alias
                    break;

                // AI response transcript (complete).
                case 'response.output_audio_transcript.done':   // GA
                case 'response.audio_transcript.done':          // beta alias
                    console.log('[RealtimeClient] AI said:', data.transcript);
                    this.onTranscript?.(data.transcript, 'ai');
                    break;

                // AI starts speaking (WebRTC output audio buffer started).
                case 'output_audio_buffer.started':
                    console.log('[RealtimeClient] AI started speaking (buffer)');
                    if (!this.isSpeaking) {
                        this.isSpeaking = true;
                        this.onAudioStart?.();
                    }
                    this._startEventBasedLipSync();
                    break;

                // AI finished speaking (WebRTC output audio buffer stopped).
                case 'output_audio_buffer.stopped':
                    console.log('[RealtimeClient] AI stopped speaking (buffer)');
                    this._lastAudioEventTime = 0;
                    this.isSpeaking = false;
                    this.onAudioEnd?.();
                    this._stopEventBasedLipSync();
                    break;

                // Audio delta events keep the lip sync alive (fallback trigger).
                case 'response.output_audio.delta':  // GA
                case 'response.audio.delta':         // beta alias
                    this._lastAudioEventTime = performance.now();
                    if (!this._lipSyncAnimationId) {
                        if (!this.isSpeaking) {
                            this.isSpeaking = true;
                            this.onAudioStart?.();
                        }
                        this._startEventBasedLipSync();
                    }
                    break;

                case 'response.output_audio.done':  // GA
                case 'response.audio.done':         // beta alias
                    console.log('[RealtimeClient] Audio stream done');
                    break;

                // User starts speaking (interruption / barge-in detection).
                case 'input_audio_buffer.speech_started':
                    console.log('[RealtimeClient] User started speaking');
                    this.isListening = true;
                    break;

                // User stopped speaking.
                case 'input_audio_buffer.speech_stopped':
                    console.log('[RealtimeClient] User stopped speaking');
                    this.isListening = false;
                    break;

                // Session created.
                case 'session.created':
                    console.log('[RealtimeClient] Session created:', data.session?.id);
                    break;

                // Error.
                case 'error':
                    console.error('[RealtimeClient] Server error:', data.error);
                    this.onError?.(new Error(data.error?.message || 'Unknown server error'));
                    break;

                default:
                    // Log other events (exclude high-frequency audio events).
                    if (data.type &&
                        !data.type.startsWith('response.audio') &&
                        !data.type.startsWith('response.output_audio') &&
                        !data.type.startsWith('output_audio_buffer')) {
                        console.log('[RealtimeClient] Event:', data.type);
                    }
            }
        } catch (error) {
            console.error('[RealtimeClient] Failed to parse event:', error);
        }
    }

    // Event-based lip sync - generates natural mouth movement based on audio events.
    _startEventBasedLipSync() {
        if (this._lipSyncAnimationId) return; // Already running

        console.log('[RealtimeClient] Starting event-based lip sync');
        this._lipSyncPhase = 0;

        const eps = LIP_SYNC_CONFIG.WIND_DOWN_EPSILON;

        const animateLipSync = () => {
            if (!this.isSpeaking && this._lastAudioEventTime === 0) {
                // Wind down to neutral.
                const smoothed = this.visemeSmoother.update({ aa: 0, oh: 0, ee: 0 });
                this.onVisemeUpdate?.(smoothed);

                if (smoothed.aa < eps && smoothed.oh < eps && smoothed.ee < eps) {
                    this._lipSyncAnimationId = null;
                    console.log('[RealtimeClient] Lip sync animation stopped');
                    return;
                }
                this._lipSyncAnimationId = requestAnimationFrame(animateLipSync);
                return;
            }

            // Generate natural-looking viseme values from several sine waves,
            // producing varied, speech-like mouth movements.
            this._lipSyncPhase += LIP_SYNC_CONFIG.PHASE_STEP;

            const primary = Math.sin(this._lipSyncPhase * 2.1) * 0.5 + 0.5;   // ~6-8 Hz
            const secondary = Math.sin(this._lipSyncPhase * 1.3) * 0.3 + 0.5; // ~3-4 Hz
            const tertiary = Math.sin(this._lipSyncPhase * 3.7) * 0.2 + 0.5;  // ~10-12 Hz

            const randomFactor = 0.9 + Math.random() * 0.2;

            const rawVisemes = {
                aa: Math.min(1, primary * 0.7 * randomFactor),
                oh: Math.min(1, secondary * 0.5 * randomFactor),
                ee: Math.min(1, tertiary * 0.4 * randomFactor),
            };

            const smoothed = this.visemeSmoother.update(rawVisemes);
            this.onVisemeUpdate?.(smoothed);

            this._lipSyncAnimationId = requestAnimationFrame(animateLipSync);
        };

        this._lipSyncAnimationId = requestAnimationFrame(animateLipSync);
    }

    _stopEventBasedLipSync() {
        // Don't cancel immediately - the animation winds down to neutral and
        // stops itself once the visemes reach near-zero.
        console.log('[RealtimeClient] Signaling lip sync to stop');
    }

    async _initAudioAnalyser(audioElement) {
        // Kept for potential future use; event-based lip sync is now primary.
        try {
            this.audioAnalyser = new AudioAnalyser();
            await this.audioAnalyser.init(audioElement);
            console.log('[RealtimeClient] Audio analyser initialized (backup)');
        } catch (error) {
            console.log('[RealtimeClient] Audio analyser init skipped - using event-based lip sync');
        }
    }

    _startVisemeLoop() {
        // Legacy hook - event-based lip sync is now primary.
        console.log('[RealtimeClient] Viseme loop ready (event-based lip sync active)');
    }

    // Send a text message to the AI.
    sendText(text) {
        if (!this.dc || this.dc.readyState !== 'open') {
            console.warn('[RealtimeClient] DataChannel not ready');
            return;
        }

        const event = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        };

        this.dc.send(JSON.stringify(event));
        this.dc.send(JSON.stringify({ type: 'response.create' }));
    }

    // Interrupt the AI's current response.
    interrupt() {
        if (!this.dc || this.dc.readyState !== 'open') return;
        this.dc.send(JSON.stringify({ type: 'response.cancel' }));
    }

    disconnect() {
        console.log('[RealtimeClient] Disconnecting...');

        // Stop microphone.
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Close data channel.
        if (this.dc) {
            this.dc.close();
            this.dc = null;
        }

        // Close peer connection.
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        // Clean up audio output.
        if (this.audioEl) {
            this.audioEl.srcObject = null;
            if (this.audioEl.parentNode) {
                this.audioEl.parentNode.removeChild(this.audioEl);
            }
            this.audioEl = null;
        }

        // Clean up audio analyser.
        if (this.audioAnalyser) {
            this.audioAnalyser.disconnect();
            this.audioAnalyser = null;
        }

        // Clean up lip sync animation.
        if (this._lipSyncAnimationId) {
            cancelAnimationFrame(this._lipSyncAnimationId);
            this._lipSyncAnimationId = null;
        }

        if (this.visemeSmoother) {
            this.visemeSmoother.reset();
        }

        this.isConnected = false;
        this.isSpeaking = false;
        this.isListening = false;

        this.onConnectionChange?.('disconnected');
    }

    // Get current connection state.
    getState() {
        return {
            isConnected: this.isConnected,
            isSpeaking: this.isSpeaking,
            isListening: this.isListening,
        };
    }
}

// Export for use in other scripts.
window.RealtimeClient = RealtimeClient;
