// Audio processing utilities for lip sync with WebRTC
// Ported from livichat-next/src/lib/realtime/audioProcessor.ts

class AudioAnalyser {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.isInitialized = false;
    }

    async init(source) {
        // Clean up any existing context
        if (this.audioContext) {
            try {
                await this.audioContext.close();
            } catch (e) {
                // Ignore close errors
            }
        }

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.isInitialized = false;

        // Resume audio context if suspended (required by browsers)
        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('[AudioAnalyser] Audio context resumed');
            } catch (e) {
                console.error('[AudioAnalyser] Failed to resume audio context:', e);
                throw new Error('Failed to resume audio context. User interaction may be required.');
            }
        }

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.65;
        this.analyser.minDecibels = -85;
        this.analyser.maxDecibels = -10;

        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        if (source instanceof MediaStream) {
            const audioTracks = source.getAudioTracks();
            console.log('[AudioAnalyser] MediaStream audio tracks:', audioTracks.length);
            this.source = this.audioContext.createMediaStreamSource(source);
            if (this.source) {
                this.source.connect(this.analyser);
            }
        } else if (source instanceof HTMLAudioElement) {
            // For WebRTC streams, we MUST use srcObject (MediaStream) directly
            // createMediaElementSource doesn't work for remote WebRTC audio due to CORS
            if (source.srcObject instanceof MediaStream) {
                const audioTracks = source.srcObject.getAudioTracks();
                console.log('[AudioAnalyser] Using srcObject MediaStream, tracks:', audioTracks.length);
                if (audioTracks.length === 0) {
                    console.warn('[AudioAnalyser] No audio tracks in srcObject!');
                }
                this.source = this.audioContext.createMediaStreamSource(source.srcObject);
                this.source.connect(this.analyser);
                // Note: Don't connect to destination - the HTMLAudioElement handles playback
                console.log('[AudioAnalyser] Connected MediaStream to analyser');
            } else {
                // Fallback for local audio files (non-WebRTC)
                console.log('[AudioAnalyser] Using HTMLAudioElement source (local file)');
                try {
                    if (source._audioSourceNode) {
                        console.log('[AudioAnalyser] Reusing existing source node');
                        this.source = source._audioSourceNode;
                    } else {
                        this.source = this.audioContext.createMediaElementSource(source);
                        source._audioSourceNode = this.source;
                    }
                    this.source.connect(this.analyser);
                    this.analyser.connect(this.audioContext.destination);
                } catch (e) {
                    console.error('[AudioAnalyser] MediaElement source error:', e);
                    throw e;
                }
            }
        }

        this.isInitialized = true;
        console.log('[AudioAnalyser] Initialized successfully');
    }

    getFrequencyData() {
        if (!this.analyser || !this.dataArray) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    // Get viseme values for lip sync
    getVisemeValues() {
        const data = this.getFrequencyData();
        if (!data || !this.isInitialized) return { aa: 0, oh: 0, ee: 0 };

        // Get overall volume to determine if there's speech
        const overallVolume = this._average(data) / 255;

        // Debug: log audio level periodically
        if (!this._debugCounter) this._debugCounter = 0;
        this._debugCounter++;
        if (this._debugCounter % 60 === 0) {
            console.log('[AudioAnalyser] Audio level:', overallVolume.toFixed(4), 'context state:', this.audioContext?.state);
        }

        // Dynamic threshold - slightly higher to reduce noise sensitivity
        const threshold = 0.012;
        if (overallVolume < threshold) {
            return { aa: 0, oh: 0, ee: 0 };
        }

        // Speech frequency ranges (adjusted for human voice ~85-255Hz fundamentals)
        // With 1024 FFT and 48kHz sample rate, each bin is ~47Hz
        // Bin 2-15: ~94-705Hz - Low frequencies (fundamental voice)
        const lowBand = this._average(data.slice(2, 15)) / 255;

        // Bin 15-40: ~705-1880Hz - Mid frequencies (formants)
        const midBand = this._average(data.slice(15, 40)) / 255;

        // Bin 40-80: ~1880-3760Hz - High frequencies (consonants, sibilants)
        const highBand = this._average(data.slice(40, 80)) / 255;

        // Amplify and normalize values with adjusted multipliers
        // Using power curve for more natural response
        const aa = Math.min(1, Math.pow(lowBand * 2.8, 0.65));
        const oh = Math.min(1, Math.pow(midBand * 2.4, 0.65));
        const ee = Math.min(1, Math.pow(highBand * 2.8, 0.65));

        return { aa, oh, ee };
    }

    // Get overall audio level (0-1)
    getAudioLevel() {
        const data = this.getFrequencyData();
        if (!data) return 0;
        return this._average(data) / 255;
    }

    _average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }

    disconnect() {
        if (this.source) {
            this.source.disconnect();
        }
        if (this.analyser) {
            this.analyser.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.source = null;
        this.analyser = null;
        this.audioContext = null;
        this.dataArray = null;
        this.isInitialized = false;
    }
}

// Linear interpolation helper
function lerp(current, target, factor) {
    return current + (target - current) * factor;
}

// Smooth transition for viseme values
class VisemeSmoother {
    constructor(lerpFactor = 0.3) {
        this.current = { aa: 0, oh: 0, ee: 0 };
        this.lerpFactor = lerpFactor;
    }

    update(target) {
        this.current = {
            aa: lerp(this.current.aa, target.aa, this.lerpFactor),
            oh: lerp(this.current.oh, target.oh, this.lerpFactor),
            ee: lerp(this.current.ee, target.ee, this.lerpFactor),
        };
        return { ...this.current };
    }

    reset() {
        this.current = { aa: 0, oh: 0, ee: 0 };
    }
}

// Export for use in other scripts
window.AudioAnalyser = AudioAnalyser;
window.VisemeSmoother = VisemeSmoother;
window.lerp = lerp;
