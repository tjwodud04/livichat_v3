class Live2DManager {
    constructor() {
        this.model = null;        // Live2D 모델 객체를 저장할 변수
        this.app = null;          // PIXI 애플리케이션 객체를 저장할 변수
        this.canvas = document.getElementById('live2d-canvas');  // HTML에서 Live2D 캔버스 요소를 가져옴
        window.PIXI = PIXI;       // PIXI 객체를 전역 변수로 설정
        console.log('Live2DManager initialized');  // Live2DManager가 초기화되었음을 콘솔에 출력
    }

    async initialize() {
        try {
            // PIXI 애플리케이션 생성 및 설정
            this.app = new PIXI.Application({
                view: this.canvas,                // 렌더링할 캔버스 지정
                transparent: true,                // 배경 투명도 활성화
                autoStart: true,                  // 자동 시작 활성화
                resolution: window.devicePixelRatio || 1,  // 디바이스 픽셀 비율에 맞게 해상도 설정
                antialias: true,                  // 안티앨리어싱 활성화
                autoDensity: true,                // 자동 밀도 조정 활성화
                backgroundColor: 0xffffff,        // 배경색 흰색으로 설정
                backgroundAlpha: 0                // 배경 완전 투명으로 설정
            });
            console.log('PIXI Application created successfully');  // PIXI 애플리케이션 생성 성공 메시지

            const modelPath = '/model/kei/kei_vowels_pro.model3.json';  // Live2D 모델 파일 경로 설정
            console.log('Loading Live2D model from:', modelPath);  // 모델 로딩 시작 메시지
            this.model = await PIXI.live2d.Live2DModel.from(modelPath);  // 모델 파일로부터 Live2D 모델 로드
            console.log('Live2D model loaded successfully');  // 모델 로딩 성공 메시지

            // 모델 크기와 위치 조정
            this.model.scale.set(0.5);  // 크기를 0.65에서 0.5로 축소
            this.model.anchor.set(0.5, 0.5);  // 앵커 포인트를 중앙으로 설정
            this.model.x = this.app.screen.width / 2;  // X 위치를 화면 중앙으로 설정
            this.model.y = this.app.screen.height / 2;  // Y 위치를 화면 중앙으로 설정

            this.app.stage.addChild(this.model);  // PIXI 스테이지에 모델 추가
            this.setExpression('neutral');  // 초기 표정을 'neutral'로 설정
        } catch (error) {
            console.error('Live2D model loading failed:', error);  // 모델 로딩 실패 시 에러 출력
        }
    }

    setExpression(expression) {
        if (this.model) {  // 모델이 로드되었는지 확인
            try {
                console.log('Setting expression to:', expression);  // 표정 설정 시작 메시지
                this.model.expression(expression);  // 모델의 표정 설정
            } catch (error) {
                console.error('Failed to update Live2D expression:', error);  // 표정 업데이트 실패 시 에러 출력
            }
        }
    }

    async playAudioWithLipSync(audioBase64) {
        if (!this.model) {  // 모델이 로드되지 않았으면 함수 종료
            console.warn('Live2D model not initialized');  // 모델 초기화 안됨 경고
            return;
        }

        try {
            console.log('Starting audio playback with lip sync');  // 립싱크와 함께 오디오 재생 시작 메시지
            const audioData = atob(audioBase64);  // Base64 인코딩된 오디오 데이터 디코딩
            const arrayBuffer = new ArrayBuffer(audioData.length);  // 오디오 데이터 길이의 버퍼 생성
            const uint8Array = new Uint8Array(arrayBuffer);  // 8비트 부호 없는 정수 배열 생성

            // 디코딩된 오디오 데이터를 바이트 배열로 변환
            for (let i = 0; i < audioData.length; i++) {
                uint8Array[i] = audioData.charCodeAt(i);
            }

            const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });  // 오디오 데이터로 Blob 객체 생성
            const audioUrl = URL.createObjectURL(audioBlob);  // Blob을 URL로 변환
            console.log('Audio blob created and URL generated');  // Blob 생성 및 URL 생성 완료 메시지

            // 모델로 오디오 재생 및 립싱크 시작
            this.model.speak(audioUrl, {
                volume: 1.0,  // 볼륨 설정
                crossOrigin: "anonymous"  // 크로스 오리진 설정
            });

            // 오디오 재생이 완료될 때까지 기다리는 Promise 반환
            return new Promise((resolve) => {
                setTimeout(() => {
                    URL.revokeObjectURL(audioUrl);  // 생성된 URL 해제
                    console.log('Audio playback completed, URL revoked');  // 오디오 재생 완료 및 URL 해제 메시지
                    resolve();  // Promise 해결
                }, 500);  // 0.5초 후 실행
            });
        } catch (error) {
            console.error('Audio playback error:', error);  // 오디오 재생 에러 출력
            this.setExpression('neutral');  // 에러 발생 시 표정을 'neutral'로 재설정
        }
    }

    stopSpeaking() {
        if (this.model) {  // 모델이 로드되었는지 확인
            console.log('Stopping speech and resetting expression');  // 말하기 중지 및 표정 재설정 메시지
            this.model.stopSpeaking();  // 모델의 말하기 중지
            this.setExpression('neutral');  // 표정을 'neutral'로 재설정
        }
    }

    // 립싱크(입모양) 수동 제어 함수 추가
    updateLipSync(volume) {
        if (this.model && this.model.internalModel && this.model.internalModel.coreModel) {
            // volume(0~1) 값에 따라 입모양 파라미터를 조정
            // Kei/haru 모두 ParamMouthOpenY 사용
            this.model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', volume);
        }
    }
}

class AudioManager {
    constructor() {
        this.mediaRecorder = null;  // 미디어 레코더 객체를 저장할 변수
        this.audioChunks = [];      // 오디오 청크를 저장할 배열
        this.isRecording = false;   // 녹음 중인지 여부를 나타내는 플래그
        this.audioContext = null;   // 오디오 컨텍스트 객체를 저장할 변수
        this.analyser = null;       // 오디오 분석기 객체를 저장할 변수
        this.processor = null;      // 오디오 프로세서 객체를 저장할 변수
        this.audioStream = null;    // 오디오 스트림 객체를 저장할 변수
        this.initAudioContext();    // 오디오 컨텍스트 초기화 함수 호출
        console.log('AudioManager initialized');  // AudioManager 초기화 완료 메시지
    }

    initAudioContext() {
        try {
            // 브라우저에 맞는 AudioContext 생성
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();  // 오디오 분석기 생성
            console.log('Audio context initialized successfully');  // 오디오 컨텍스트 초기화 성공 메시지
        } catch (error) {
            console.error('Failed to initialize audio context:', error);  // 오디오 컨텍스트 초기화 실패 에러 출력
        }
    }

    async startRecording() {
        try {
            // 미디어 디바이스 API 지원 여부 확인
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Media Devices API not supported');  // 지원하지 않으면 에러 발생
            }

            // 오디오 스트림 생성 설정
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,    // 모노 채널 설정
                    sampleRate: 16000   // 샘플링 레이트 16kHz 설정
                },
                video: false  // 비디오 비활성화
            });
            console.log('Audio stream obtained successfully');  // 오디오 스트림 획득 성공 메시지

            this.audioStream = stream;  // 오디오 스트림 저장
            this.mediaRecorder = new MediaRecorder(stream);  // 미디어 레코더 생성
            
            // 데이터 사용 가능할 때 이벤트 핸들러
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {  // 데이터 크기가 0보다 큰 경우에만 처리
                    this.audioChunks.push(event.data);  // 오디오 청크 배열에 데이터 추가
                    console.log('Audio chunk received:', event.data.size, 'bytes', 'type:', event.data.type);  // 오디오 청크 수신 정보 출력
                }
            };

            // 오디오 컨텍스트와 분석기가 초기화되었는지 확인
            if (this.audioContext && this.analyser) {
                const source = this.audioContext.createMediaStreamSource(stream);  // 미디어 스트림 소스 생성
                source.connect(this.analyser);  // 소스를 분석기에 연결
                console.log('Audio source connected to analyser');  // 오디오 소스 연결 메시지
            }

            this.mediaRecorder.start(100);  // 레코딩 시작, 100ms마다 데이터 전송
            this.isRecording = true;  // 녹음 중 플래그 설정
            console.log('Recording started with format:', this.mediaRecorder.mimeType);  // 녹음 시작 및 포맷 정보 출력
            return true;  // 녹음 시작 성공

        } catch (error) {
            console.error('Failed to start recording:', error);  // 녹음 시작 실패 에러 출력
            alert('마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');  // 마이크 권한 필요 알림
            return false;  // 녹음 시작 실패
        }
    }

    stopRecording() {
        return new Promise((resolve) => {  // Promise 반환
            if (this.mediaRecorder && this.isRecording) {  // 미디어 레코더가 있고 녹음 중인 경우
                console.log('Stopping recording');  // 녹음 중지 메시지
                
                // 녹음 중지 이벤트 핸들러
                this.mediaRecorder.onstop = () => {
                    const blob = this.getAudioBlob();  // 오디오 Blob 획득
                    this.audioChunks = [];  // 오디오 청크 배열 초기화
                    this.isRecording = false;  // 녹음 중 플래그 해제
                    
                    // 오디오 스트림이 있으면 모든 트랙 중지
                    if (this.audioStream) {
                        this.audioStream.getTracks().forEach(track => track.stop());
                        this.audioStream = null;  // 오디오 스트림 초기화
                    }
                    
                    resolve(blob);  // Promise 해결, Blob 반환
                };
                
                this.mediaRecorder.stop();  // 미디어 레코더 중지
            } else {
                resolve(null);  // 녹음 중이 아니면 null 반환
            }
        });
    }

    getAudioBlob() {
        // 오디오 청크로 Blob 생성
        const blob = new Blob(this.audioChunks, {
            type: this.mediaRecorder ? this.mediaRecorder.mimeType : 'audio/webm'  // MIME 타입 설정
        });
        console.log('Audio blob created:', blob.size, 'bytes');  // Blob 생성 정보 출력
        return blob;  // Blob 반환
    }

    getAudioData() {
        if (!this.analyser) {  // 분석기가 없으면 빈 배열 반환
            console.warn('Analyser not initialized');  // 분석기 초기화 안됨 경고
            return new Uint8Array();  // 빈 Uint8Array 반환
        }
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);  // 분석기 주파수 빈 카운트 크기의 배열 생성
        this.analyser.getByteTimeDomainData(dataArray);  // 시간 도메인 데이터 가져오기
        return dataArray;  // 데이터 배열 반환
    }
}

class ChatManager {
    constructor(characterType = 'kei') {  // 기본값으로 'kei' 설정
        this.chatHistory = document.getElementById('chatHistory');  // 채팅 기록 DOM 요소 가져오기
        this.isPlaying = false;  // 오디오 재생 중인지 여부를 나타내는 플래그
        this.conversationHistory = []; // 컨텍스트를 위한 대화 기록 저장
        this.characterType = characterType;  // 캐릭터 타입 저장
        console.log('ChatManager initialized');  // ChatManager 초기화 완료 메시지
    }

    addMessage(role, message) {
        console.log(`Adding ${role} message:`, message);  // 메시지 추가 정보 출력

        const messageElement = document.createElement('div');  // 메시지 요소 생성
        messageElement.className = `message ${role}-message`;  // 메시지 클래스 설정

        // AI 메시지인 경우 프로필 추가
        if (role === 'ai') {
            const profile = document.createElement('div');  // 프로필 요소 생성
            profile.className = 'message-profile';  // 프로필 클래스 설정

            // 캐릭터별 프로필 이미지 설정
            const characterImg = document.createElement('img');  // 이미지 요소 생성
            characterImg.src = role === 'ai' ? (
                this.characterType === 'haru' ? '/model/haru/profile.jpg' :
                this.characterType === 'kei' ? '/model/kei/profile.jpg' :
                '/model/momose/profile.jpg'
            ) : '';  // 캐릭터 타입에 따른 이미지 경로 설정
            profile.appendChild(characterImg);  // 프로필에 이미지 추가

            messageElement.appendChild(profile);  // 메시지 요소에 프로필 추가
        }

        const messageBubble = document.createElement('div');  // 메시지 버블 요소 생성
        messageBubble.className = 'message-bubble';  // 메시지 버블 클래스 설정

        const content = document.createElement('div');  // 콘텐츠 요소 생성
        content.className = 'message-content';  // 콘텐츠 클래스 설정
        content.textContent = message;  // 콘텐츠 텍스트 설정

        const time = document.createElement('span');  // 시간 요소 생성
        time.className = 'message-time';  // 시간 클래스 설정
        const now = new Date();  // 현재 시간 생성
        time.textContent = now.toLocaleTimeString('ko-KR', {
            hour: '2-digit',  // 시간 2자리
            minute: '2-digit'  // 분 2자리
        });  // 시간 텍스트 설정

        messageBubble.appendChild(content);  // 버블에 콘텐츠 추가
        messageBubble.appendChild(time);  // 버블에 시간 추가
        messageElement.appendChild(messageBubble);  // 메시지 요소에 버블 추가

        this.chatHistory.appendChild(messageElement);  // 채팅 기록에 메시지 요소 추가
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;  // 스크롤을 아래로 이동

        // 대화 기록에 메시지 추가
        this.conversationHistory.push({
            role: role === 'user' ? 'user' : 'assistant',  // 역할 설정
            content: message  // 내용 설정
        });
    }

    async sendAudioToServer(audioBlob) {
        try {
            console.log('Preparing to send audio to server');  // 서버로 오디오 전송 준비 메시지
            console.log('Audio blob type:', audioBlob.type);  // Blob 타입 출력
            console.log('Audio blob size:', audioBlob.size);  // Blob 크기 출력
            
            const formData = new FormData();  // FormData 객체 생성
            formData.append('audio', audioBlob, 'audio.webm');  // 오디오 Blob 추가
            formData.append('character', this.characterType);  // 캐릭터 정보 추가

            // API 키 가져오기
            const apiKey = localStorage.getItem('openai_api_key');

            console.log('Sending request to server');  // 서버 요청 전송 메시지
            const response = await fetch('/api/chat', {  // 서버 API 호출
                method: 'POST',  // POST 메서드 사용
                body: formData,  // FormData를 요청 본문으로 설정
                headers: {
                    'X-API-KEY': apiKey || ''
                }
            });

            if (!response.ok) {  // 응답이 성공이 아닌 경우
                const errorText = await response.text();  // 에러 텍스트 가져오기
                console.error('Server error response:', errorText);  // 서버 에러 응답 출력
                throw new Error(`Server responded with ${response.status}: ${errorText}`);  // 에러 발생
            }

            const data = await response.json();  // 응답 데이터를 JSON으로 파싱
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

document.addEventListener('DOMContentLoaded', () => {  // DOM 로드 완료 이벤트 처리
    console.log('Initializing application...');  // 애플리케이션 초기화 시작 메시지
    live2dManager = new Live2DManager();  // Live2D 관리자 생성
    audioManager = new AudioManager();    // 오디오 관리자 생성
    chatManager = new ChatManager('kei');  // 채팅 관리자 생성, 'kei' 캐릭터 설정

    live2dManager.initialize();  // Live2D 관리자 초기화

    const recordButton = document.getElementById('recordButton');  // 녹음 버튼 DOM 요소 가져오기
    recordButton.addEventListener('click', handleRecording);  // 녹음 버튼 클릭 이벤트 핸들러 등록

    setInterval(updateLipSync, 50);  // 50ms마다 립싱크 업데이트
    console.log('Application initialization completed');  // 애플리케이션 초기화 완료 메시지
});

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
