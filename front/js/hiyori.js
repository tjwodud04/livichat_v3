// Hiyori character page - WebRTC Realtime API integration
// Main application script for hiyori.html

// ============================================================================
// Live2D Model Manager
// ============================================================================
class Live2DManager {
    constructor() {
        this.model = null;
        this.app = null;
        this.canvas = document.getElementById('live2d-canvas');
        window.PIXI = PIXI;
        console.log('[Live2DManager] Initialized');
    }

    async initialize() {
        try {
            // 캔버스를 왼쪽 패널 크기에 맞춤
            const leftPanel = this.canvas.parentElement;
            const width = leftPanel.clientWidth;
            const height = leftPanel.clientHeight;

            this.app = new PIXI.Application({
                view: this.canvas,
                width: width,
                height: height,
                transparent: true,
                autoStart: true,
                resolution: window.devicePixelRatio || 1,
                antialias: true,
                autoDensity: true,
                backgroundColor: 0xffffff,
                backgroundAlpha: 0
            });

            const modelPath = '/model/hiyori/hiyori_pro_t11.model3.json';
            console.log('[Live2DManager] Loading model:', modelPath);
            this.model = await PIXI.live2d.Live2DModel.from(modelPath);

            this.app.stage.addChild(this.model);

            // 모델 크기와 위치 조정
            this._fitModelToCanvas();

            // Setup lip sync - manually set lipSyncIds if not defined by library
            this._setupLipSync();

            // Start idle motion
            this._startIdleMotion();

            // 윈도우 리사이즈 대응
            window.addEventListener('resize', () => this._onResize());

            console.log('[Live2DManager] Model loaded successfully');
        } catch (error) {
            console.error('[Live2DManager] Failed to load model:', error);
        }
    }

    _fitModelToCanvas() {
        if (!this.app || !this.model) return;

        const canvasWidth = this.app.screen.width;
        const canvasHeight = this.app.screen.height;

        // 모델 원본 크기 (scale 1.0 기준)
        const modelWidth = this.model.width / this.model.scale.x;
        const modelHeight = this.model.height / this.model.scale.y;

        // 캔버스에 맞는 스케일 계산 (여백 10% 포함)
        const scaleX = (canvasWidth * 0.9) / modelWidth;
        const scaleY = (canvasHeight * 0.9) / modelHeight;
        const scale = Math.min(scaleX, scaleY);

        this.model.scale.set(scale);
        this.model.anchor.set(0.5, 0.5);
        this.model.x = canvasWidth / 2;
        this.model.y = canvasHeight * 0.4;  // 약간 위로
    }

    _onResize() {
        if (!this.app || !this.model) return;
        const leftPanel = this.canvas.parentElement;
        const width = leftPanel.clientWidth;
        const height = leftPanel.clientHeight;

        this.app.renderer.resize(width, height);
        this._fitModelToCanvas();
    }

    _setupLipSync() {
        if (!this.model || !this.model.internalModel) return;

        const internalModel = this.model.internalModel;
        const coreModel = internalModel.coreModel;

        // Log model structure for debugging
        console.log('[Live2DManager] Setting up lip sync...');
        console.log('[Live2DManager] lipSyncIds before setup:', internalModel.lipSyncIds);

        // For pixi-live2d-display Cubism 4 models:
        // lipSyncIds should be an array of CubismId objects
        // If not set, we need to create it manually

        if (coreModel && coreModel._model) {
            try {
                const model = coreModel._model;
                const paramCount = model.parameters.count;
                console.log('[Live2DManager] Model has', paramCount, 'parameters');

                // Find ParamMouthOpenY index
                for (let i = 0; i < paramCount; i++) {
                    const paramId = model.parameters.ids[i];
                    if (paramId === 'ParamMouthOpenY') {
                        this._mouthParamIndex = i;
                        console.log('[Live2DManager] Found ParamMouthOpenY at index:', i);
                        break;
                    }
                }

                // Try to set lipSyncIds for library-level lip sync support
                // pixi-live2d-display expects CubismId objects in lipSyncIds array
                if (!internalModel.lipSyncIds || internalModel.lipSyncIds.length === 0) {
                    // Get CubismId from framework if available
                    const framework = window.Live2DCubismFramework;
                    if (framework && framework.CubismFramework) {
                        const idManager = framework.CubismFramework.getIdManager();
                        const mouthParamCubismId = idManager.getId('ParamMouthOpenY');
                        internalModel.lipSyncIds = [mouthParamCubismId];
                        console.log('[Live2DManager] Set lipSyncIds to:', internalModel.lipSyncIds);
                    }
                }
            } catch (e) {
                console.log('[Live2DManager] Could not setup lipSyncIds:', e.message);
            }
        }

        // Store reference to coreModel for direct parameter access
        this._coreModel = coreModel;
        console.log('[Live2DManager] Lip sync setup complete');
    }

    _startIdleMotion() {
        if (this.model && this.model.internalModel) {
            try {
                // Try to play idle motion if available
                this.model.motion('Idle');
            } catch (e) {
                console.log('[Live2DManager] No idle motion available');
            }
        }
    }

    // Stop all motions and pause motion manager to allow lip sync to be visible
    stopMotions() {
        if (this.model && this.model.internalModel) {
            const motionManager = this.model.internalModel.motionManager;
            if (motionManager) {
                // Stop all current motions
                motionManager.stopAllMotions();

                // Store original update function to pause motion updates
                if (!this._originalMotionUpdate && motionManager.update) {
                    this._originalMotionUpdate = motionManager.update.bind(motionManager);
                    // Override to do nothing (pause motions)
                    motionManager.update = () => false;
                    console.log('[Live2DManager] Motion manager paused');
                }
            }
        }
        this._motionsPaused = true;
    }

    // Resume idle motion
    resumeIdleMotion() {
        if (this.model && this.model.internalModel) {
            const motionManager = this.model.internalModel.motionManager;
            if (motionManager && this._originalMotionUpdate) {
                // Restore original motion update function
                motionManager.update = this._originalMotionUpdate;
                this._originalMotionUpdate = null;
                console.log('[Live2DManager] Motion manager resumed');
            }
        }
        this._motionsPaused = false;
        this._startIdleMotion();
    }

    // Start continuous lip sync updates by hooking into the model's update cycle
    startLipSyncTicker(getVisemesFn) {
        if (this._lipSyncTickerAdded) return;

        this._currentVisemes = { aa: 0, oh: 0, ee: 0 };
        this._getVisemes = getVisemesFn;

        // Hook into the model's internal update cycle
        // This ensures lip sync is applied AFTER motion updates but BEFORE rendering
        if (this.model && this.model.internalModel) {
            const internalModel = this.model.internalModel;

            // Store original update function
            if (!this._originalUpdateFn) {
                this._originalUpdateFn = internalModel.update.bind(internalModel);
            }

            // Override update to inject lip sync after motion processing
            internalModel.update = (dt, now) => {
                // First, let the original update run (processes motions, physics, etc.)
                this._originalUpdateFn(dt, now);

                // Then apply lip sync to override mouth parameter
                if (this._getVisemes) {
                    const visemes = this._getVisemes();
                    if (visemes) {
                        this._applyLipSyncAfterMotion(visemes);
                    }
                }
            };

            console.log('[Live2DManager] Lip sync hooked into model update cycle');
        }

        this._lipSyncTickerAdded = true;
        console.log('[Live2DManager] Lip sync ticker started');
    }

    // Apply lip sync AFTER motion update - this ensures our values aren't overwritten
    _applyLipSyncAfterMotion(visemes) {
        if (!this.model || !this.model.internalModel) return;

        const mouthOpen = Math.min(1, Math.max(visemes.aa, visemes.oh * 0.8) * 1.5);
        const coreModel = this.model.internalModel.coreModel;

        if (!coreModel || !coreModel._model) return;

        // Direct parameter array access - most reliable method
        if (this._mouthParamIndex !== undefined && coreModel._model.parameters?.values) {
            coreModel._model.parameters.values[this._mouthParamIndex] = mouthOpen;
        }

        // Debug log (once)
        if (!this._lipSyncHookLogged && mouthOpen > 0.1) {
            console.log('[Live2DManager] Lip sync after motion - mouthOpen:', mouthOpen.toFixed(3));
            this._lipSyncHookLogged = true;
        }
    }

    _lipSyncTick() {
        // Kept for compatibility but main lip sync now happens in model.update hook
        if (!this._getVisemes) return;
        const visemes = this._getVisemes();
        if (visemes) {
            this._applyLipSyncDirect(visemes);
        }
    }

    // Direct lip sync application - set parameter value directly on Cubism Core model
    // This runs after motion updates to override mouth position
    _applyLipSyncDirect(visemes) {
        if (!this.model || !this.model.internalModel) return;

        try {
            // Calculate mouth open amount from visemes (amplified for visibility)
            const mouthOpen = Math.min(1, Math.max(visemes.aa, visemes.oh * 0.8) * 1.5);
            const internalModel = this.model.internalModel;
            const coreModel = internalModel.coreModel;

            if (!coreModel || !coreModel._model) return;

            // Debug: Log structure once
            if (!this._structureLogged) {
                console.log('[Live2DManager] Lip sync direct mode');
                console.log('[Live2DManager] coreModel._model:', !!coreModel._model);

                // Find ParamMouthOpenY index if not already found
                if (this._mouthParamIndex === undefined) {
                    try {
                        // Access Cubism Core directly
                        const model = coreModel._model;
                        const paramCount = model.parameters.count;
                        console.log('[Live2DManager] Parameter count:', paramCount);

                        for (let i = 0; i < paramCount; i++) {
                            const paramId = model.parameters.ids[i];
                            if (paramId === 'ParamMouthOpenY') {
                                this._mouthParamIndex = i;
                                console.log('[Live2DManager] ParamMouthOpenY index:', i);
                                break;
                            }
                        }
                    } catch (e) {
                        console.log('[Live2DManager] Could not find param index:', e.message);
                    }
                }
                this._structureLogged = true;
            }

            // Method 1: Direct Cubism Core parameter array access (most reliable)
            if (this._mouthParamIndex !== undefined && coreModel._model?.parameters?.values) {
                coreModel._model.parameters.values[this._mouthParamIndex] = mouthOpen;
            }
            // Method 2: Also set internalModel.lipSync for library integration
            internalModel.lipSync = mouthOpen;

            // Log first success
            if (!this._lipSyncAppliedLogged && mouthOpen > 0.1) {
                console.log('[Live2DManager] Lip sync applied - mouthOpen:', mouthOpen.toFixed(3),
                    'paramIndex:', this._mouthParamIndex);
                this._lipSyncAppliedLogged = true;
            }
        } catch (e) {
            if (!this._lipSyncTickerErrorLogged) {
                console.error('[Live2DManager] Ticker lip sync error:', e);
                this._lipSyncTickerErrorLogged = true;
            }
        }
    }

    stopLipSyncTicker() {
        if (this._lipSyncTickerAdded) {
            // Restore original update function
            if (this._originalUpdateFn && this.model && this.model.internalModel) {
                this.model.internalModel.update = this._originalUpdateFn;
                console.log('[Live2DManager] Restored original model update');
            }

            // Remove PIXI ticker if it was added
            if (this.app) {
                this.app.ticker.remove(this._lipSyncTick, this);
            }

            this._lipSyncTickerAdded = false;
            this._lipSyncHookLogged = false;
            console.log('[Live2DManager] Lip sync ticker stopped');
        }
    }

    // Update lip sync with viseme values from audio analysis
    // Reference: https://docs.live2d.com/en/cubism-sdk-tutorials/native-lipsync-from-wav-web/
    updateLipSync(visemes) {
        if (!this.model || !this.model.internalModel) {
            return;
        }

        try {
            // Calculate mouth open amount from visemes (amplified for visibility)
            const mouthOpen = Math.min(1, Math.max(visemes.aa, visemes.oh * 0.8) * 1.5);

            const internalModel = this.model.internalModel;
            const coreModel = internalModel.coreModel;

            if (!coreModel) return;

            // For Cubism 4 models in pixi-live2d-display:
            // Use setParameterValueById with the lipSyncIds from model settings
            // The model's .model3.json defines "LipSync" group with "ParamMouthOpenY"

            // Get the lip sync parameter ID
            let lipSyncParamId = 'ParamMouthOpenY';  // Default standard ID
            if (internalModel.settings?.groups) {
                const lipSyncGroup = internalModel.settings.groups.find(g => g.Name === 'LipSync');
                if (lipSyncGroup && lipSyncGroup.Ids && lipSyncGroup.Ids.length > 0) {
                    lipSyncParamId = lipSyncGroup.Ids[0];
                }
            }

            // Apply lip sync value using the core model's API
            // For Cubism 4: coreModel is CubismModel from Live2D Cubism SDK
            if (typeof coreModel.setParameterValueById === 'function') {
                // Cubism 4 SDK method - weight 0.8 as per official docs
                coreModel.setParameterValueById(lipSyncParamId, mouthOpen, 0.8);
            } else if (coreModel._model && coreModel._model.parameters) {
                // Fallback: Direct access to Cubism 4 Core internal model
                const params = coreModel._model.parameters;
                if (params.ids && params.values) {
                    const idx = params.ids.indexOf(lipSyncParamId);
                    if (idx !== -1) {
                        // Blend with existing value (similar to addParameterValue behavior)
                        params.values[idx] = params.values[idx] * 0.2 + mouthOpen * 0.8;
                    }
                }
            }

            // Debug: Log first successful update
            if (!this._lipSyncDebugLogged && mouthOpen > 0.1) {
                console.log('[Live2DManager] Lip sync applied - mouthOpen:', mouthOpen.toFixed(3),
                            'paramId:', lipSyncParamId);
                this._lipSyncDebugLogged = true;
            }
        } catch (error) {
            if (!this._lipSyncErrorLogged) {
                console.error('[Live2DManager] Lip sync error:', error);
                this._lipSyncErrorLogged = true;
            }
        }
    }

    setExpression(expression) {
        if (this.model) {
            try {
                this.model.expression(expression);
            } catch (error) {
                console.log('[Live2DManager] Expression not found:', expression);
            }
        }
    }
}

// ============================================================================
// Chat UI Manager
// ============================================================================
class ChatManager {
    constructor() {
        this.chatHistory = document.getElementById('chatHistory');
        this.conversationHistory = [];
        console.log('[ChatManager] Initialized');
    }

    addMessage(role, message) {
        if (!message || !message.trim()) return;

        console.log(`[ChatManager] ${role}: ${message.substring(0, 50)}...`);

        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;

        if (role === 'ai') {
            const profile = document.createElement('div');
            profile.className = 'message-profile';
            const characterImg = document.createElement('img');
            characterImg.src = '/img/momose_profile.PNG';
            profile.appendChild(characterImg);
            messageElement.appendChild(profile);
        }

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';

        const content = document.createElement('div');
        content.className = 'message-content';

        if (role === 'ai') {
            // Sanitize and render HTML for AI messages (for links)
            content.innerHTML = this._sanitizeHtml(message);
        } else {
            content.textContent = message;
        }

        messageBubble.appendChild(content);

        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageBubble.appendChild(time);
        messageElement.appendChild(messageBubble);
        this.chatHistory.appendChild(messageElement);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;

        this.conversationHistory.push({
            role: role === 'user' ? 'user' : 'assistant',
            content: message
        });
    }

    _sanitizeHtml(input) {
        // First, convert markdown links [text](url) to HTML <a> tags
        let processed = (input || '').replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        const wrapper = document.createElement('div');
        wrapper.innerHTML = processed;

        const allowed = new Set(['A', 'BR']);

        const all = wrapper.querySelectorAll('*');
        for (const el of all) {
            const tag = el.tagName;
            if (!allowed.has(tag)) {
                el.replaceWith(document.createTextNode(el.textContent || ''));
                continue;
            }
            if (tag === 'A') {
                const href = el.getAttribute('href') || '';
                if (!/^https?:\/\//i.test(href)) {
                    el.replaceWith(document.createTextNode(el.textContent || ''));
                    continue;
                }
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener noreferrer');
                for (const attr of [...el.attributes]) {
                    const name = attr.name.toLowerCase();
                    if (!['href', 'target', 'rel'].includes(name)) {
                        el.removeAttribute(attr.name);
                    }
                }
            }
        }
        return wrapper.innerHTML.replace(/\n/g, '<br>');
    }

    addSystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message system-message';
        messageElement.textContent = message;
        this.chatHistory.appendChild(messageElement);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }
}

// ============================================================================
// Main Application
// ============================================================================
let live2dManager;
let chatManager;
let realtimeClient;

async function initializeApp() {
    console.log('[App] Initializing...');

    // Initialize managers
    live2dManager = new Live2DManager();
    chatManager = new ChatManager();

    // Initialize Live2D model
    await live2dManager.initialize();

    // Show initial greeting (text only due to web autoplay policy)
    // Detect language from HTML lang attribute
    const lang = document.documentElement.lang || 'ko';
    const greeting = lang === 'ko'
        ? '안녕! 나는 히요리야 😊 지금의 감정 상태가 어떤지 이야기해줘~'
        : "Hi! I'm Hiyori 😊 Tell me how you're feeling right now~";
    setTimeout(() => {
        chatManager.addMessage('ai', greeting);
    }, 700);

    // Set up connect button
    const connectButton = document.getElementById('connectButton');
    const connectionStatus = document.getElementById('connectionStatus');

    connectButton.addEventListener('click', handleConnect);

    console.log('[App] Initialization complete');
}

async function handleConnect() {
    const connectButton = document.getElementById('connectButton');
    const connectionStatus = document.getElementById('connectionStatus');

    // If already connected, disconnect
    if (realtimeClient && realtimeClient.isConnected) {
        realtimeClient.disconnect();
        connectButton.textContent = '대화 시작';
        connectButton.classList.remove('connected');
        connectionStatus.textContent = '';
        connectionStatus.className = 'connection-status';
        return;
    }

    // Start connection
    connectButton.disabled = true;
    connectButton.textContent = '연결 중...';
    connectionStatus.textContent = '연결 중...';
    connectionStatus.className = 'connection-status connecting';

    try {
        realtimeClient = new RealtimeClient('hiyori');

        // Set up callbacks
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

        realtimeClient.onTranscript = (text, role) => {
            chatManager.addMessage(role, text);
        };

        // Store current visemes for PIXI ticker access
        let currentVisemes = { aa: 0, oh: 0, ee: 0 };
        let isSpeaking = false;

        realtimeClient.onAudioStart = () => {
            console.log('[App] AI started speaking');
            isSpeaking = true;
            // Stop idle motions so lip sync is clearly visible
            live2dManager.stopMotions();
            // Start PIXI ticker-based lip sync for better frame synchronization
            live2dManager.startLipSyncTicker(() => isSpeaking ? currentVisemes : { aa: 0, oh: 0, ee: 0 });
        };

        realtimeClient.onAudioEnd = () => {
            console.log('[App] AI finished speaking');
            isSpeaking = false;
            // Stop the lip sync ticker
            live2dManager.stopLipSyncTicker();
            // Resume idle motion after speaking
            live2dManager.resumeIdleMotion();
        };

        realtimeClient.onVisemeUpdate = (visemes) => {
            // Update the shared viseme state (PIXI ticker will read this)
            currentVisemes = visemes;
            // Debug: log viseme values periodically
            if (Math.random() < 0.05) {  // Log ~5% of updates
                console.log('[App] Viseme update:', visemes);
            }
        };

        realtimeClient.onError = (error) => {
            console.error('[App] Realtime error:', error);
            chatManager.addSystemMessage('오류가 발생했습니다: ' + error.message);
        };

        // Connect
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
