// Shared Live2D model controller for LiviChat character pages.
//
// Loads a Cubism 4 model into a PIXI canvas, fits it to the panel, and drives
// mouth movement (lip sync) by hooking the model's internal update cycle so the
// mouth parameter is applied AFTER motion/physics but BEFORE rendering.
//
// The per-character differences (model path, vertical placement, idle-motion
// name) are passed in via the constructor so a single class serves every page.

class Live2DManager {
    /**
     * @param {Object} options
     * @param {string} options.modelPath        Path to the .model3.json file.
     * @param {number} [options.modelYRatio]    Vertical anchor as a fraction of canvas height.
     * @param {string} [options.idleMotionName] Motion group name looped while idle.
     */
    constructor({ modelPath, modelYRatio = 0.45, idleMotionName = 'Idle' }) {
        this.model = null;
        this.app = null;
        this.canvas = document.getElementById('live2d-canvas');
        this.modelPath = modelPath;
        this.modelYRatio = modelYRatio;
        this.idleMotionName = idleMotionName;
        window.PIXI = PIXI;
        console.log('[Live2DManager] Initialized');
    }

    async initialize() {
        try {
            // Match the canvas to the left panel size.
            const leftPanel = this.canvas.parentElement;
            const width = leftPanel.clientWidth;
            const height = leftPanel.clientHeight;

            this.app = new PIXI.Application({
                view: this.canvas,
                width,
                height,
                transparent: true,
                autoStart: true,
                resolution: window.devicePixelRatio || 1,
                antialias: true,
                autoDensity: true,
                backgroundColor: 0xffffff,
                backgroundAlpha: 0,
            });

            console.log('[Live2DManager] Loading model:', this.modelPath);
            this.model = await PIXI.live2d.Live2DModel.from(this.modelPath);
            this.app.stage.addChild(this.model);

            this._fitModelToCanvas();
            this._setupLipSync();
            this._startIdleMotion();

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

        // Original model size (at scale 1.0).
        const modelWidth = this.model.width / this.model.scale.x;
        const modelHeight = this.model.height / this.model.scale.y;

        // Fit within the canvas, leaving a 10% margin.
        const scaleX = (canvasWidth * 0.9) / modelWidth;
        const scaleY = (canvasHeight * 0.9) / modelHeight;
        const scale = Math.min(scaleX, scaleY);

        this.model.scale.set(scale);
        this.model.anchor.set(0.5, 0.5);
        this.model.x = canvasWidth / 2;
        this.model.y = canvasHeight * this.modelYRatio;
    }

    _onResize() {
        if (!this.app || !this.model) return;
        const leftPanel = this.canvas.parentElement;
        this.app.renderer.resize(leftPanel.clientWidth, leftPanel.clientHeight);
        this._fitModelToCanvas();
    }

    _setupLipSync() {
        if (!this.model || !this.model.internalModel) return;

        const internalModel = this.model.internalModel;
        const coreModel = internalModel.coreModel;
        console.log('[Live2DManager] Setting up lip sync...');

        if (coreModel && coreModel._model) {
            try {
                const model = coreModel._model;
                const paramCount = model.parameters.count;

                // Cache the ParamMouthOpenY index for fast direct writes later.
                for (let i = 0; i < paramCount; i++) {
                    if (model.parameters.ids[i] === 'ParamMouthOpenY') {
                        this._mouthParamIndex = i;
                        console.log('[Live2DManager] Found ParamMouthOpenY at index:', i);
                        break;
                    }
                }

                // Register lipSyncIds for library-level lip sync when unset.
                if (!internalModel.lipSyncIds || internalModel.lipSyncIds.length === 0) {
                    const framework = window.Live2DCubismFramework;
                    if (framework && framework.CubismFramework) {
                        const idManager = framework.CubismFramework.getIdManager();
                        internalModel.lipSyncIds = [idManager.getId('ParamMouthOpenY')];
                    }
                }
            } catch (e) {
                console.log('[Live2DManager] Could not setup lip sync params:', e.message);
            }
        }

        this._coreModel = coreModel;
        console.log('[Live2DManager] Lip sync setup complete');
    }

    _startIdleMotion() {
        if (this.model && this.model.internalModel) {
            try {
                this.model.motion(this.idleMotionName);
            } catch (e) {
                console.log('[Live2DManager] No idle motion available');
            }
        }
    }

    // Stop all motions and pause the motion manager so lip sync stays visible.
    stopMotions() {
        if (this.model && this.model.internalModel) {
            const motionManager = this.model.internalModel.motionManager;
            if (motionManager) {
                motionManager.stopAllMotions();
                if (!this._originalMotionUpdate && motionManager.update) {
                    this._originalMotionUpdate = motionManager.update.bind(motionManager);
                    motionManager.update = () => false;
                    console.log('[Live2DManager] Motion manager paused');
                }
            }
        }
        this._motionsPaused = true;
    }

    // Resume idle motion after speaking.
    resumeIdleMotion() {
        if (this.model && this.model.internalModel) {
            const motionManager = this.model.internalModel.motionManager;
            if (motionManager && this._originalMotionUpdate) {
                motionManager.update = this._originalMotionUpdate;
                this._originalMotionUpdate = null;
                console.log('[Live2DManager] Motion manager resumed');
            }
        }
        this._motionsPaused = false;
        this._startIdleMotion();
    }

    // Hook the model's update cycle so lip sync is applied after motion updates.
    startLipSyncTicker(getVisemesFn) {
        if (this._lipSyncTickerAdded) return;

        this._currentVisemes = { aa: 0, oh: 0, ee: 0 };
        this._getVisemes = getVisemesFn;

        if (this.model && this.model.internalModel) {
            const internalModel = this.model.internalModel;

            if (!this._originalUpdateFn) {
                this._originalUpdateFn = internalModel.update.bind(internalModel);
            }

            internalModel.update = (dt, now) => {
                // Run the original update (motions, physics, etc.) first...
                this._originalUpdateFn(dt, now);
                // ...then override the mouth parameter with the current viseme.
                if (this._getVisemes) {
                    const visemes = this._getVisemes();
                    if (visemes) this._applyLipSyncAfterMotion(visemes);
                }
            };
            console.log('[Live2DManager] Lip sync hooked into model update cycle');
        }

        this._lipSyncTickerAdded = true;
        console.log('[Live2DManager] Lip sync ticker started');
    }

    // Apply lip sync AFTER the motion update so our value is not overwritten.
    _applyLipSyncAfterMotion(visemes) {
        if (!this.model || !this.model.internalModel) return;

        const mouthOpen = Math.min(1, Math.max(visemes.aa, visemes.oh * 0.8) * 1.5);
        const coreModel = this.model.internalModel.coreModel;
        if (!coreModel || !coreModel._model) return;

        if (this._mouthParamIndex !== undefined && coreModel._model.parameters?.values) {
            coreModel._model.parameters.values[this._mouthParamIndex] = mouthOpen;
        }
    }

    stopLipSyncTicker() {
        if (this._lipSyncTickerAdded) {
            if (this._originalUpdateFn && this.model && this.model.internalModel) {
                this.model.internalModel.update = this._originalUpdateFn;
                console.log('[Live2DManager] Restored original model update');
            }
            this._lipSyncTickerAdded = false;
            console.log('[Live2DManager] Lip sync ticker stopped');
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

// Export for use by characterApp.js and the per-character entry scripts.
window.Live2DManager = Live2DManager;
