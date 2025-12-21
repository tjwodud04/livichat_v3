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
     * @param {object|null} aiPayload  전체 페이로드(프로액티브 카드 포함)
     */
    addMessage(role, message, link = null, aiPayload = null) {
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
            const safeHTML = _sanitizeHtml(message);
            content.innerHTML = safeHTML;
        } else {
            content.textContent = message;
        }
        messageBubble.appendChild(content);

        // (호환) 링크 문자열이 별도로 넘어오면 기존 방식 유지
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
            console.log('Sending request to server (once)');
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
            console.log('Server response received (once):', data);
            return data;
        } catch (error) {
            console.error('Server communication error:', error);
            throw error;
        }
    }

    // 대화 기록 가져오기
    getConversationHistory() {
        return this.conversationHistory;
    }
}

let live2dManager;  // Live2D 관리자 전역 변수
let audioManager;   // 오디오 관리자 전역 변수
let chatManager;    // 채팅 관리자 전역 변수

// 립싱크 업데이트 함수
function updateLipSync() {
    if (audioManager && audioManager.isRecording) {
        const audioData = audioManager.getAudioData();
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += Math.abs(audioData[i] - 128);
        }
        const average = sum / audioData.length;
        const normalizedValue = average / 128;
        live2dManager.updateLipSync(normalizedValue);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing application...');
    live2dManager = new Live2DManager();
    audioManager = new AudioManager();
    chatManager = new ChatManager('kei');

    await live2dManager.initialize();

    // 캐릭터 로드 후 0.7초 뒤 안내 멘트
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
    const recordButton = document.getElementById('recordButton');

    if (chatManager.isPlaying) {
        console.log('Cannot start recording while audio is playing');
        return;
    }

    if (!audioManager.isRecording) {
        console.log('Starting new recording');
        const started = await audioManager.startRecording();
        if (started) {
            recordButton.textContent = '멈추기';
            recordButton.classList.add('recording');
            live2dManager.setExpression('listening');
        }
    } else {
        console.log('Stopping recording and processing audio');
        recordButton.disabled = true;
        recordButton.textContent = '처리 중...';
        recordButton.classList.remove('recording');
        live2dManager.setExpression('neutral');

        try {
            const audioBlob = await audioManager.stopRecording();
            if (!audioBlob) throw new Error('No audio data recorded');

            console.log('Sending audio to server for processing');
            let response;
            try {
                response = await sendAudioToServerStream(audioBlob, chatManager.characterType);
            } catch (e) {
                console.warn('stream failed, fallback to once:', e);
                response = await chatManager.sendAudioToServer(audioBlob);
            }

            if (response.user_text) {
                chatManager.addMessage('user', response.user_text);
            }

            if (response.ai_text) {
                // 4번째 인자로 전체 payload 전달 → 카드까지 렌더
                chatManager.addMessage('ai', response.ai_text, null, response);

                if (response.audio) {
                    console.log('Starting audio playback');
                    chatManager.isPlaying = true;
                    live2dManager.setExpression('speaking');

                    try {
                        await live2dManager.playAudioWithLipSync(response.audio);
                        console.log('Audio playback completed');
                    } catch (error) {
                        console.error('Playback error:', error);
                    } finally {
                        live2dManager.setExpression('neutral');
                        chatManager.isPlaying = false;
                    }
                }
            }
        } catch (error) {
            console.error('Error processing recording:', error);
            chatManager.addMessage('system', '오류가 발생했습니다. 다시 시도해주세요.');
        } finally {
            live2dManager.setExpression('neutral');
            chatManager.isPlaying = false;
            recordButton.disabled = false;
            recordButton.textContent = '이야기하기';
        }
    }
}

// ====== 스트리밍 송수신: /scripts/chat_stream ======
async function sendAudioToServerStream(audioBlob, characterType = 'kei') {
  const apiKey = localStorage.getItem('openai_api_key') || '';
  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');
  formData.append('character', characterType);

  const resp = await fetch('/scripts/chat_stream', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey },
    body: formData
  });

  if (!resp.ok || !resp.body) {
    throw new Error(`stream failed: ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalPayload = null;

  // 최초 토큰 수신 시 AI 말풍선 뼈대
  let hasSkeleton = false;
  let skeletonEl = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);

      // SSE 포맷: "event: token" + "data: {...}"
      const lines = chunk.split('\n');
      const ev = (lines.find(l => l.startsWith('event:')) || '').slice(6).trim();
      const dataLine = (lines.find(l => l.startsWith('data:')) || '').slice(5).trim();

      if (!ev || !dataLine) continue;

      if (ev === 'token') {
        const { token } = JSON.parse(dataLine);
        if (!hasSkeleton) {
          chatManager.addMessage('ai', '', null, null);
          skeletonEl = chatManager.chatHistory.lastElementChild.querySelector('.message-content');
          hasSkeleton = true;
        }
        if (skeletonEl) {
          const safe = _sanitizeHtml((skeletonEl.innerHTML || '') + token);
          skeletonEl.innerHTML = safe;
          chatManager.chatHistory.scrollTop = chatManager.chatHistory.scrollHeight;
        }
      } else if (ev === 'final') {
        finalPayload = JSON.parse(dataLine);
      }
    }
  }

  if (!finalPayload) throw new Error('no final payload from stream');
  return finalPayload;
}

// [ADD] 허용 태그만 남기는 간단 Sanitizer: <a>, <br>만 허용
function _sanitizeHtml(input) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = input || '';

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
        if (!['href', 'target', 'rel'].includes(name)) el.removeAttribute(attr.name);
      }
    }
  }
  return wrapper.innerHTML.replace(/\n/g, '<br>');
}
