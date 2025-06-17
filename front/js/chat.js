// Live2D 모델 관리 클래스
class Live2DManager {
    constructor() {
        this.model = null;
        this.app = null;
        this.canvas = document.getElementById('live2d-canvas');
        window.PIXI = PIXI;
        console.log('Live2DManager initialized');
    }

    async initialize() {
        try {
            this.app = new PIXI.Application({
                view: this.canvas,
                transparent: true,
                autoStart: true,
                resolution: window.devicePixelRatio || 1,
                antialias: true,
                autoDensity: true,
                backgroundColor: 0xffffff,
                backgroundAlpha: 0
            });
            console.log('PIXI Application created successfully');

            const modelPath = '/model/kei/kei_vowels_pro.model3.json';
            console.log('Loading Live2D model from:', modelPath);
            this.model = await PIXI.live2d.Live2DModel.from(modelPath);
            console.log('Live2D model loaded successfully');

            this.model.scale.set(0.5);
            this.model.anchor.set(0.5, 0.5);
            this.model.x = this.app.screen.width / 2;
            this.model.y = this.app.screen.height / 2;

            this.app.stage.addChild(this.model);
            this.setExpression('neutral');
        } catch (error) {
            console.error('Live2D model loading failed:', error);
        }
    }

    setExpression(expression) {
        if (this.model) {
            try {
                console.log('Setting expression to:', expression);
                this.model.expression(expression);
            } catch (error) {
                console.error('Failed to update Live2D expression:', error);
            }
        }
    }

    async playAudioWithLipSync(audioBase64) {
        if (!this.model) {
            console.warn('Live2D model not initialized');
            return;
        }

        try {
            console.log('Starting audio playback with lip sync');
            const audioData = atob(audioBase64);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioData.length; i++) {
                uint8Array[i] = audioData.charCodeAt(i);
            }

            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                alert('이 브라우저는 webm 녹음을 지원하지 않습니다. 최신 Chrome을 사용해 주세요.');
                return;
            }
            const audioBlob = new Blob([arrayBuffer], { type: mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);
            console.log('Audio blob created and URL generated');

            this.model.speak(audioUrl, {
                volume: 1.0,
                crossOrigin: 'anonymous'
            });

            return new Promise((resolve) => {
                setTimeout(() => {
                    URL.revokeObjectURL(audioUrl);
                    console.log('Audio playback completed, URL revoked');
                    resolve();
                }, 500);
            });
        } catch (error) {
            console.error('Audio playback error:', error);
            this.setExpression('neutral');
        }
    }

    stopSpeaking() {
        if (this.model) {
            console.log('Stopping speech and resetting expression');
            this.model.stopSpeaking();
            this.setExpression('neutral');
        }
    }

    updateLipSync(volume) {
        if (this.model && this.model.internalModel && this.model.internalModel.coreModel) {
            this.model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', volume);
        }
    }
}

// 오디오 녹음 및 업로드 관리 클래스
class AudioManager {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.processor = null;
        this.audioStream = null;
        this.initAudioContext();
        console.log('AudioManager initialized');
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            console.log('Audio context initialized successfully');
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
        }
    }

    async startRecording() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Media Devices API not supported');
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 24000 }, video: false });
            console.log('Audio stream obtained successfully');

            this.audioStream = stream;
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                alert('이 브라우저는 webm 녹음을 지원하지 않습니다. 최신 Chrome을 사용해 주세요.');
                return false;
            }
            this.mediaRecorder = new MediaRecorder(stream, { mimeType });

            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('Audio chunk received:', event.data.size, 'bytes', 'type:', event.data.type);
                }
            };

            if (this.audioContext && this.analyser) {
                const source = this.audioContext.createMediaStreamSource(stream);
                source.connect(this.analyser);
                console.log('Audio source connected to analyser');
            }

            this.mediaRecorder.start(100);
            this.isRecording = true;
            console.log('Recording started with format:', this.mediaRecorder.mimeType);
            return true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
            return false;
        }
    }

    stopRecording() {
        return new Promise((resolve) => {
            if (this.mediaRecorder && this.isRecording) {
                console.log('Stopping recording');
                this.mediaRecorder.onstop = () => {
                    const blob = this.getAudioBlob();
                    this.audioChunks = [];
                    this.isRecording = false;
                    if (this.audioStream) {
                        this.audioStream.getTracks().forEach(track => track.stop());
                        this.audioStream = null;
                    }
                    resolve(blob);
                };
                this.mediaRecorder.stop();
            } else {
                resolve(null);
            }
        });
    }

    getAudioBlob() {
        if (this.mediaRecorder && this.mediaRecorder.mimeType.startsWith('audio/webm')) {
            const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
            console.log('Audio blob created:', blob.size, 'bytes');
            return blob;
        } else {
            alert('이 브라우저에서는 webm 녹음이 지원되지 않습니다. 최신 Chrome을 사용해 주세요.');
            return null;
        }
    }

    getAudioData() {
        if (!this.analyser) {
            console.warn('Analyser not initialized');
            return new Uint8Array();
        }
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }
}

// 채팅 및 대화 이력 관리 클래스
class ChatManager {
    constructor(characterType = 'kei') {
        this.chatHistory = document.getElementById('chatHistory');
        this.isPlaying = false;
        this.conversationHistory = [];
        this.characterType = characterType;
        console.log('ChatManager initialized');
    }

    /**
     * @param {'user'|'ai'|'system'} role
     * @param {string} message
     * @param {string|null} link  클릭 가능한 링크 (옵셔널)
     */
    addMessage(role, message, link = null) {
        console.log(`Adding ${role} message:`, message);
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;

        if (role === 'ai') {
            const profile = document.createElement('div');
            profile.className = 'message-profile';
            const characterImg = document.createElement('img');
            characterImg.src = (
                this.characterType === 'haru' ? '/model/haru/profile.jpg' :
                this.characterType === 'kei' ? '/model/kei/profile.jpg' :
                '/model/momose/profile.jpg'
            );
            profile.appendChild(characterImg);
            messageElement.appendChild(profile);
        }

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';

        const content = document.createElement('div');
        content.className = 'message-content';
        if (role === 'ai') {
            // 줄바꿈 처리 및 기본 텍스트 표시
            content.innerHTML = message.replace(/\n/g, '<br>');
        } else {
            content.textContent = message;
        }
        messageBubble.appendChild(content);

        // 링크가 별도 넘어왔다면 추가 렌더링
        if (role === 'ai' && link) {
            const linkWrap = document.createElement('div');
            linkWrap.className = 'message-link';
            const a = document.createElement('a');
            a.href = link;
            a.target = '_blank';
            a.textContent = '▶️ 제안 링크 보기';
            linkWrap.appendChild(a);
            messageElement.appendChild(linkWrap);
        }

        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        messageBubble.appendChild(time);
        messageElement.appendChild(messageBubble);
        this.chatHistory.appendChild(messageElement);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;

        this.conversationHistory.push({ role: role === 'user' ? 'user' : 'assistant', content: message });
    }

    async sendAudioToServer(audioBlob) {
        try {
            console.log('Preparing to send audio to server');
            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio.webm');
            formData.append('character', this.characterType);
          
            const apiKey = localStorage.getItem('openai_api_key');
            console.log('Sending request to server');
            const response = await fetch('/scripts/chat', {
                method: 'POST',
                body: formData,
                headers: { 'X-API-KEY': apiKey || '' }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                throw new Error(`Server responded with ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('Server response received:', data);  // 서버 응답 수신 메시지
            return data;  // 데이터 반환
        } catch (error) {
            console.error('Server communication error:', error);  // 서버 통신 에러 출력
            throw error;  // 에러 다시 발생
        }
    }

    // 대화 기록 가져오기
    getConversationHistory() {
        return this.conversationHistory;  // 대화 기록 배열 반환
    }
}

let live2dManager;  // Live2D 관리자 전역 변수
let audioManager;   // 오디오 관리자 전역 변수
let chatManager;    // 채팅 관리자 전역 변수

// 립싱크 업데이트 함수
function updateLipSync() {
    if (audioManager && audioManager.isRecording) {  // 오디오 관리자가 있고 녹음 중인 경우
        const audioData = audioManager.getAudioData();  // 오디오 데이터 가져오기
        let sum = 0;  // 합계 초기화
        for (let i = 0; i < audioData.length; i++) {
            sum += Math.abs(audioData[i] - 128);  // 각 데이터와 128의 차이 절대값 합계
        }
        const average = sum / audioData.length;  // 평균 계산
        const normalizedValue = average / 128;  // 정규화된 값 계산

        live2dManager.updateLipSync(normalizedValue);  // 립싱크 업데이트
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing application...');  // 애플리케이션 초기화 시작 메시지
    live2dManager = new Live2DManager();  // Live2D 관리자 생성
    audioManager = new AudioManager();    // 오디오 관리자 생성
    chatManager = new ChatManager('kei');  // 채팅 관리자 생성, 'kei' 캐릭터 설정

    await live2dManager.initialize();  // Live2D 관리자 초기화 (모델 로드 완료까지 대기)

    // 캐릭터 로드 후 0.7초 뒤 안내 멘트 추가
    setTimeout(() => {
        chatManager.addMessage('ai', '만나서 반가워요. 지금 느끼는 감정이 어떤지 들려줘요.');
    }, 700);

    const recordButton = document.getElementById('recordButton');
    recordButton.addEventListener('click', handleRecording);

    setInterval(updateLipSync, 50);
    console.log('Application initialization completed');
});

// 녹음 버튼 클릭 시 동작
async function handleRecording() {
    const recordButton = document.getElementById('recordButton');  // 녹음 버튼 DOM 요소 가져오기

    if (chatManager.isPlaying) {  // 오디오 재생 중인 경우
        console.log('Cannot start recording while audio is playing');  // 녹음 시작 불가 메시지
        return;  // 함수 종료
    }

    if (!audioManager.isRecording) {  // 녹음 중이 아닌 경우
        console.log('Starting new recording');  // 새 녹음 시작 메시지
        const started = await audioManager.startRecording();  // 녹음 시작
        if (started) {  // 녹음 시작 성공한 경우
            recordButton.textContent = '멈추기';  // 버튼 텍스트 변경
            recordButton.classList.add('recording');  // 녹음 중 클래스 추가
            live2dManager.setExpression('listening');  // 'listening' 표정 설정
        }
    } else {  // 녹음 중인 경우
        console.log('Stopping recording and processing audio');  // 녹음 중지 및 오디오 처리 메시지
        recordButton.disabled = true;  // 버튼 비활성화
        recordButton.textContent = '처리 중...';  // 버튼 텍스트 변경
        recordButton.classList.remove('recording');  // 녹음 중 클래스 제거
        live2dManager.setExpression('neutral');  // 'neutral' 표정 설정

        try {
            const audioBlob = await audioManager.stopRecording();  // 녹음 중지 및 Blob 반환
            if (!audioBlob) {  // Blob이 없는 경우
                throw new Error('No audio data recorded');  // 에러 발생
            }

            console.log('Sending audio to server for processing');  // 서버 처리를 위한 오디오 전송 메시지
            const response = await chatManager.sendAudioToServer(audioBlob);  // 서버로 오디오 전송 및 응답 대기
            console.log('Received server response:', response);  // 서버 응답 수신 메시지

            if (response.user_text) {  // 사용자 텍스트가 있는 경우
                chatManager.addMessage('user', response.user_text);  // 사용자 메시지 추가
            }

            if (response.ai_text) {  // AI 텍스트가 있는 경우
                chatManager.addMessage('ai', response.ai_text);  // AI 메시지 추가
                
                if (response.audio) {  // 오디오가 있는 경우
                    console.log('Starting audio playback');  // 오디오 재생 시작 메시지
                    chatManager.isPlaying = true;  // 재생 중 플래그 설정
                    live2dManager.setExpression('speaking');  // 'speaking' 표정 설정

                    try {
                        await live2dManager.playAudioWithLipSync(response.audio);  // 립싱크와 함께 오디오 재생
                        console.log('Audio playback completed');  // 오디오 재생 완료 메시지
                    } catch (error) {
                        console.error('Playback error:', error);  // 재생 에러 출력
                    } finally {
                        live2dManager.setExpression('neutral');  // 'neutral' 표정 설정
                        chatManager.isPlaying = false;  // 재생 중 플래그 해제
                    }
                }
            }
        } catch (error) {
            console.error('Error processing recording:', error);  // 녹음 처리 에러 출력
            chatManager.addMessage('system', '오류가 발생했습니다. 다시 시도해주세요.');  // 시스템 에러 메시지 추가
        } finally {
            live2dManager.setExpression('neutral');  // 'neutral' 표정 설정
            chatManager.isPlaying = false;  // 재생 중 플래그 해제
            recordButton.disabled = false;  // 버튼 활성화
            recordButton.textContent = '이야기하기';  // 버튼 텍스트 변경
        }
    }
}
