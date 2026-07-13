// Shared bootstrap for LiviChat character pages.
//
// Wires together the Live2D model (live2dController.js), the chat UI
// (chatUI.js), and the Realtime WebRTC client (realtimeClient.js). Each
// character page supplies its differences via a config object and calls
// initCharacterApp(config) from a thin per-character entry script.

/**
 * @param {Object} config
 * @param {string} config.characterType   Backend persona id ('haru' | 'hiyori').
 * @param {string} config.modelPath        Live2D .model3.json path.
 * @param {number} config.modelYRatio      Vertical placement ratio for the model.
 * @param {string} config.idleMotionName   Idle motion group name.
 * @param {string} config.profileImg       AI avatar image path.
 * @param {{ko: string, en: string}} config.greeting  Localized opening line.
 */
function initCharacterApp(config) {
    let live2dManager;
    let chatManager;
    let realtimeClient;

    async function initializeApp() {
        console.log('[App] Initializing...');

        live2dManager = new Live2DManager({
            modelPath: config.modelPath,
            modelYRatio: config.modelYRatio,
            idleMotionName: config.idleMotionName,
        });
        chatManager = new ChatManager({ profileImg: config.profileImg });

        await live2dManager.initialize();

        // Text-only greeting (audio playback is blocked by browser autoplay policy).
        const lang = document.documentElement.lang || 'ko';
        const greeting = lang === 'ko' ? config.greeting.ko : config.greeting.en;
        setTimeout(() => chatManager.addMessage('ai', greeting), 700);

        document.getElementById('connectButton').addEventListener('click', handleConnect);
        console.log('[App] Initialization complete');
    }

    async function handleConnect() {
        const connectButton = document.getElementById('connectButton');
        const connectionStatus = document.getElementById('connectionStatus');

        // Already connected -> treat the click as "disconnect".
        if (realtimeClient && realtimeClient.isConnected) {
            realtimeClient.disconnect();
            connectButton.textContent = '대화 시작';
            connectButton.classList.remove('connected');
            connectionStatus.textContent = '';
            connectionStatus.className = 'connection-status';
            return;
        }

        connectButton.disabled = true;
        connectButton.textContent = '연결 중...';
        connectionStatus.textContent = '연결 중...';
        connectionStatus.className = 'connection-status connecting';

        try {
            realtimeClient = new RealtimeClient(config.characterType);

            realtimeClient.onConnectionChange = (status) => {
                console.log('[App] Connection status:', status);
                switch (status) {
                    case 'connected':
                        connectButton.disabled = false;
                        connectButton.textContent = '대화 종료';
                        connectButton.classList.add('connected');
                        connectionStatus.textContent = '연결됨 - 말해보세요!';
                        connectionStatus.className = 'connection-status connected';
                        break;
                    case 'disconnected':
                        connectButton.disabled = false;
                        connectButton.textContent = '대화 시작';
                        connectButton.classList.remove('connected');
                        connectionStatus.textContent = '';
                        connectionStatus.className = 'connection-status';
                        break;
                    case 'error':
                        connectButton.disabled = false;
                        connectButton.textContent = '대화 시작';
                        connectButton.classList.remove('connected');
                        connectionStatus.textContent = '연결 오류';
                        connectionStatus.className = 'connection-status error';
                        break;
                }
            };

            realtimeClient.onTranscript = (text, role) => chatManager.addMessage(role, text);

            // Shared viseme state the Live2D update hook reads each frame.
            let currentVisemes = { aa: 0, oh: 0, ee: 0 };
            let isSpeaking = false;

            realtimeClient.onAudioStart = () => {
                console.log('[App] AI started speaking');
                isSpeaking = true;
                live2dManager.stopMotions();
                live2dManager.startLipSyncTicker(
                    () => (isSpeaking ? currentVisemes : { aa: 0, oh: 0, ee: 0 })
                );
            };

            realtimeClient.onAudioEnd = () => {
                console.log('[App] AI finished speaking');
                isSpeaking = false;
                live2dManager.stopLipSyncTicker();
                live2dManager.resumeIdleMotion();
            };

            realtimeClient.onVisemeUpdate = (visemes) => {
                currentVisemes = visemes;
            };

            realtimeClient.onError = (error) => {
                console.error('[App] Realtime error:', error);
                chatManager.addSystemMessage('오류가 발생했습니다: ' + error.message);
            };

            await realtimeClient.connect();
        } catch (error) {
            console.error('[App] Failed to connect:', error);
            connectButton.disabled = false;
            connectButton.textContent = '대화 시작';
            connectionStatus.textContent = '연결 실패';
            connectionStatus.className = 'connection-status error';
            chatManager.addSystemMessage('연결에 실패했습니다. 다시 시도해주세요.');
        }
    }

    document.addEventListener('DOMContentLoaded', initializeApp);
}

// Export for use by the per-character entry scripts (haru.js / hiyori.js).
window.initCharacterApp = initCharacterApp;
