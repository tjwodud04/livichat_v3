// OpenAI Realtime API WebRTC Client
// Handles real-time audio streaming with the OpenAI API

class RealtimeClient {
    constructor(characterType = 'hiyori') {
        this.pc = null;               // RTCPeerConnection
        this.dc = null;               // DataChannel
        this.audioEl = null;          // Output audio element
        this.mediaStream = null;      // Microphone stream
        this.characterType = characterType;

        // Audio analysis for lip sync (fallback)
        this.audioAnalyser = null;
        this.visemeSmoother = new VisemeSmoother(0.25);

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

            // 1. Get ephemeral token from backend
            const apiKey = localStorage.getItem('openai_api_key') || '';
            const response = await fetch('/api/realtime/session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': apiKey
                },
                body: JSON.stringify({ character: this.characterType })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to get session token');
            }

            const { client_secret } = await response.json();

            if (!client_secret || !client_secret.value) {
                throw new Error('Invalid session response');
            }

            // 2. Create RTCPeerConnection
            this.pc = new RTCPeerConnection();

            // 3. Set up audio output
            this.audioEl = document.createElement('audio');
            this.audioEl.autoplay = true;
            document.body.appendChild(this.audioEl);  // Must be in DOM for some browsers

            this.pc.ontrack = (e) => {
                console.log('[RealtimeClient] Received audio track');
                this.audioEl.srcObject = e.streams[0];

                // Initialize audio analyser after audio starts playing
                this.audioEl.onplaying = () => {
                    if (!this.audioAnalyser) {
                        this._initAudioAnalyser(this.audioEl);
                    }
                };
            };

            // 4. Get microphone input
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 24000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            this.pc.addTrack(this.mediaStream.getAudioTracks()[0]);

            // 5. Create DataChannel for events
            this.dc = this.pc.createDataChannel('oai-events');
            this.dc.onmessage = this._handleServerEvent.bind(this);
            this.dc.onopen = () => {
                console.log('[RealtimeClient] DataChannel opened');
                this.isConnected = true;
                this.onConnectionChange?.('connected');
                // Start viseme loop after connection is fully established
                this._startVisemeLoop();
            };
            this.dc.onclose = () => {
                console.log('[RealtimeClient] DataChannel closed');
                this.isConnected = false;
                this.onConnectionChange?.('disconnected');
            };

            // 6. Create and send SDP offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            // 7. Exchange SDP with OpenAI
            const sdpResponse = await fetch('https://api.openai.com/v1/realtime', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${client_secret.value}`,
                    'Content-Type': 'application/sdp'
                },
                body: offer.sdp
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

            switch (data.type) {
                // User's speech transcription
                case 'conversation.item.input_audio_transcription.completed':
                    console.log('[RealtimeClient] User said:', data.transcript);
                    this.onTranscript?.(data.transcript, 'user');
                    break;

                // AI response text (streaming)
                case 'response.audio_transcript.delta':
                    // Accumulate transcript delta
                    break;

                // AI response text (complete)
                case 'response.audio_transcript.done':
                    console.log('[RealtimeClient] AI said:', data.transcript);
                    this.onTranscript?.(data.transcript, 'ai');
                    break;

                // AI starts speaking (audio buffer started)
                case 'output_audio_buffer.started':
                    console.log('[RealtimeClient] AI started speaking (buffer)');
                    if (!this.isSpeaking) {
                        this.isSpeaking = true;
                        this.onAudioStart?.();
                    }
                    // Start lip sync animation
                    this._startEventBasedLipSync();
                    break;

                // AI finished speaking (audio buffer stopped)
                case 'output_audio_buffer.stopped':
                    console.log('[RealtimeClient] AI stopped speaking (buffer)');
                    this._lastAudioEventTime = 0;
                    this.isSpeaking = false;
                    this.onAudioEnd?.();
                    this._stopEventBasedLipSync();
                    break;

                // Audio delta events - keep lip sync alive
                case 'response.audio.delta':
                    this._lastAudioEventTime = performance.now();
                    // Start lip sync if not already running (fallback)
                    if (!this._lipSyncAnimationId) {
                        if (!this.isSpeaking) {
                            this.isSpeaking = true;
                            this.onAudioStart?.();
                        }
                        this._startEventBasedLipSync();
                    }
                    break;

                case 'response.audio.done':
                    // Mark audio stream complete but wait for buffer.stopped for cleanup
                    console.log('[RealtimeClient] Audio stream done');
                    break;

                // User starts speaking (interruption detection)
                case 'input_audio_buffer.speech_started':
                    console.log('[RealtimeClient] User started speaking');
                    this.isListening = true;
                    break;

                // User stopped speaking
                case 'input_audio_buffer.speech_stopped':
                    console.log('[RealtimeClient] User stopped speaking');
                    this.isListening = false;
                    break;

                // Session created
                case 'session.created':
                    console.log('[RealtimeClient] Session created:', data.session?.id);
                    break;

                // Error
                case 'error':
                    console.error('[RealtimeClient] Server error:', data.error);
                    this.onError?.(new Error(data.error?.message || 'Unknown server error'));
                    break;

                default:
                    // Log other events for debugging (exclude high-frequency audio events)
                    if (data.type &&
                        !data.type.startsWith('response.audio') &&
                        !data.type.startsWith('output_audio_buffer')) {
                        console.log('[RealtimeClient] Event:', data.type);
                    }
            }
        } catch (error) {
            console.error('[RealtimeClient] Failed to parse event:', error);
        }
    }

    // Event-based lip sync - generates natural mouth movement based on audio events
    _startEventBasedLipSync() {
        if (this._lipSyncAnimationId) return; // Already running

        console.log('[RealtimeClient] Starting event-based lip sync');
        this._lipSyncPhase = 0;

        const animateLipSync = () => {
            if (!this.isSpeaking && this._lastAudioEventTime === 0) {
                // Wind down to neutral
                const smoothed = this.visemeSmoother.update({ aa: 0, oh: 0, ee: 0 });
                this.onVisemeUpdate?.(smoothed);

                if (smoothed.aa < 0.01 && smoothed.oh < 0.01 && smoothed.ee < 0.01) {
                    this._lipSyncAnimationId = null;
                    console.log('[RealtimeClient] Lip sync animation stopped');
                    return;
                }
                this._lipSyncAnimationId = requestAnimationFrame(animateLipSync);
                return;
            }

            // Generate natural-looking viseme values using multiple sine waves
            // This creates varied, speech-like mouth movements
            this._lipSyncPhase += 0.15;

            // Primary oscillation (main mouth movement ~6-8 Hz)
            const primary = Math.sin(this._lipSyncPhase * 2.1) * 0.5 + 0.5;
            // Secondary oscillation (variation ~3-4 Hz)
            const secondary = Math.sin(this._lipSyncPhase * 1.3) * 0.3 + 0.5;
            // Tertiary oscillation (subtle variation ~10-12 Hz)
            const tertiary = Math.sin(this._lipSyncPhase * 3.7) * 0.2 + 0.5;

            // Combine oscillations with some randomness for natural feel
            const randomFactor = 0.9 + Math.random() * 0.2;

            const rawVisemes = {
                aa: Math.min(1, primary * 0.7 * randomFactor),
                oh: Math.min(1, secondary * 0.5 * randomFactor),
                ee: Math.min(1, tertiary * 0.4 * randomFactor)
            };

            // Apply smoothing
            const smoothed = this.visemeSmoother.update(rawVisemes);
            this.onVisemeUpdate?.(smoothed);

            this._lipSyncAnimationId = requestAnimationFrame(animateLipSync);
        };

        this._lipSyncAnimationId = requestAnimationFrame(animateLipSync);
    }

    _stopEventBasedLipSync() {
        // Don't immediately cancel - let the animation wind down naturally
        // The animation loop will stop itself when visemes reach near-zero
        console.log('[RealtimeClient] Signaling lip sync to stop');
    }

    async _initAudioAnalyser(audioElement) {
        // Keep this for potential future use, but event-based lip sync is now primary
        try {
            this.audioAnalyser = new AudioAnalyser();
            await this.audioAnalyser.init(audioElement);
            console.log('[RealtimeClient] Audio analyser initialized (backup)');
        } catch (error) {
            console.log('[RealtimeClient] Audio analyser init skipped - using event-based lip sync');
        }
    }

    _startVisemeLoop() {
        // Legacy viseme loop - kept for compatibility but event-based is now primary
        console.log('[RealtimeClient] Viseme loop ready (event-based lip sync active)');
    }

    // Send a text message to the AI
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
                content: [{ type: 'input_text', text }]
            }
        };

        this.dc.send(JSON.stringify(event));
        this.dc.send(JSON.stringify({ type: 'response.create' }));
    }

    // Interrupt the AI's current response
    interrupt() {
        if (!this.dc || this.dc.readyState !== 'open') return;
        this.dc.send(JSON.stringify({ type: 'response.cancel' }));
    }

    disconnect() {
        console.log('[RealtimeClient] Disconnecting...');

        // Stop microphone
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Close data channel
        if (this.dc) {
            this.dc.close();
            this.dc = null;
        }

        // Close peer connection
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        // Clean up audio
        if (this.audioEl) {
            this.audioEl.srcObject = null;
            if (this.audioEl.parentNode) {
                this.audioEl.parentNode.removeChild(this.audioEl);
            }
            this.audioEl = null;
        }

        // Clean up audio analyser
        if (this.audioAnalyser) {
            this.audioAnalyser.disconnect();
            this.audioAnalyser = null;
        }

        // Clean up lip sync animation
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

    // Get current connection state
    getState() {
        return {
            isConnected: this.isConnected,
            isSpeaking: this.isSpeaking,
            isListening: this.isListening
        };
    }
}

// Export for use in other scripts
window.RealtimeClient = RealtimeClient;
