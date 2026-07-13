// Shared front-end configuration constants for the LiviChat Realtime client.
// Loaded before realtimeClient.js / characterApp.js so the values below are
// available as globals (window.*) to every character page.

// OpenAI Realtime API (GA) + local endpoints and microphone capture settings.
const REALTIME_CONFIG = {
    // Backend endpoint that mints a short-lived ephemeral client secret.
    SESSION_ENDPOINT: '/api/realtime/session',
    // GA WebRTC SDP exchange endpoint. The model is bound to the ephemeral key,
    // so (unlike the beta API) NO ?model= query parameter may be appended.
    SDP_ENDPOINT: 'https://api.openai.com/v1/realtime/calls',
    // Data channel carrying Realtime server/client events.
    DATA_CHANNEL_LABEL: 'oai-events',
    // Microphone capture constraints (24 kHz mono matches the PCM16 session).
    MIC_CONSTRAINTS: {
        channelCount: 1,
        sampleRate: 24000,
        echoCancellation: true,
        noiseSuppression: true,
    },
};

// Tuning constants for the event-driven lip-sync animation.
const LIP_SYNC_CONFIG = {
    SMOOTHING: 0.25,         // viseme lerp factor (0-1, higher = snappier)
    PHASE_STEP: 0.15,        // per-frame phase advance for the mouth oscillator
    WIND_DOWN_EPSILON: 0.01, // stop animating once visemes fall below this
};

window.REALTIME_CONFIG = REALTIME_CONFIG;
window.LIP_SYNC_CONFIG = LIP_SYNC_CONFIG;
