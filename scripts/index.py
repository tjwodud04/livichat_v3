# 필요한 모듈 및 라이브러리 임포트
from flask import Flask, request, send_from_directory, jsonify, render_template, abort  # Flask 웹 프레임워크 관련 기능들 임포트
from flask_cors import CORS  # 교차 출처 리소스 공유(CORS) 기능을 제공하는 Flask 확장 임포트
from openai import OpenAI  # OpenAI API와 상호작용하기 위한 클라이언트 임포트
from datetime import datetime  # 날짜 및 시간 관련 기능 임포트
from pathlib import Path  # 파일 경로 관리를 위한 클래스 임포트

import requests
import os  # 운영체제와 상호작용하기 위한 모듈 임포트
import tempfile  # 임시 파일 및 디렉토리 생성을 위한 모듈 임포트
import base64  # 바이너리 데이터의 인코딩 및 디코딩을 위한 모듈 임포트
import json  # JSON 데이터 처리를 위한 모듈 임포트
import threading  # 멀티턴 대화 이력 관리를 위한 Lock
import websockets  # WebSocket 연결용
import asyncio

# Flask 애플리케이션 초기화
app = Flask(__name__, 
            static_folder='../front',  # front 디렉토리를 static 폴더로 지정
            static_url_path='',        # 정적 파일의 URL 경로를 루트로 설정
            template_folder='../front') # front 디렉토리를 template 폴더로도 지정
CORS(app)  # CORS 지원 활성화 - 다른 도메인에서의 요청 허용

# 기본 경로 설정
BASE_DIR = Path(__file__).resolve().parent  # 현재 파일의 디렉토리 경로 설정
CONVERSATIONS_FILE = BASE_DIR / "conversations.json"  # 대화 내용을 저장할 파일 경로 설정

# OpenAI 클라이언트 생성 함수
def get_openai_client():
    api_key = request.headers.get("X-API-KEY")
    if not api_key:
        abort(401, description="OpenAI API 키가 없습니다. 웹에서 반드시 입력해야 합니다.")
    return OpenAI(api_key=api_key)

# --- 멀티턴 대화 이력(최근 3턴) 관리용 (메모리, 유저별 구분 없음) ---
conversation_history = []  # 최근 대화 이력 (user/assistant role)
history_lock = threading.Lock()

# --- 7정 감정 분석 함수 (OpenAI API 활용, 최신 gpt-4o 사용) ---
def analyze_emotion(text):
    """
    입력 텍스트에 대해 유교 7정(기쁨, 분노, 슬픔, 즐거움, 사랑, 미움, 욕심) 감정 비율(%)과 최고 감정을 반환
    """
    client = get_openai_client()
    prompt = (
        "다음 문장에서 유교의 7정(기쁨, 분노, 슬픔, 즐거움, 사랑, 미움, 욕심)에 대해 각각 0~100%로 감정 비율을 추정해 주세요. "
        "가장 높은 감정도 함께 알려주세요.\n"
        "출력 예시: {\"기쁨\":10, \"분노\":5, ...}, \"슬픔\"\n"
        f"문장: {text}"
    )
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=256,
        temperature=0.0
    )
    import ast
    import re
    content = response.choices[0].message.content
    # {"기쁨":10, ...}, "슬픔" 형태 파싱
    match = re.match(r'\s*({.*?})\s*,\s*"([^"]+)"', content)
    if match:
        try:
            percent = ast.literal_eval(match.group(1))
            top_emotion = match.group(2)
            # 값 검증
            if isinstance(percent, dict) and all(k in percent for k in ["기쁨","분노","슬픔","즐거움","사랑","미움","욕심"]):
                return percent, top_emotion
        except Exception as e:
            print(f"감정 분석 파싱 오류: {e}")
    # 실패 시 기본값
    return {"기쁨":0, "분노":0, "슬픔":0, "즐거움":0, "사랑":0, "미움":0, "욕심":0}, "기쁨"

# 루트 경로 핸들러 - 기본 페이지 제공
@app.route('/')
def index():
    return render_template('index.html')  # index.html 템플릿 렌더링

# 'haru' 페이지 경로 핸들러
@app.route('/haru')
def haru():
    return render_template('haru.html')  # haru.html 템플릿 렌더링

# 'kei' 페이지 경로 핸들러
@app.route('/kei')
def kei():
    return render_template('kei.html')  # kei.html 템플릿 렌더링

# 모델 파일 제공 경로 핸들러
@app.route('/model/<path:filename>')
def serve_model(filename):
    return send_from_directory('../model', filename)  # ../model 디렉토리에서 요청된 파일 제공

# CSS 파일 제공 경로 핸들러
@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('../front/css', filename)  # ../front/css 디렉토리에서 요청된 CSS 파일 제공

# JavaScript 파일 제공 경로 핸들러
@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('../front/js', filename)  # ../front/js 디렉토리에서 요청된 JS 파일 제공


# 대화 내용을 저장하는 함수
def save_conversation(user_input: str, ai_response: str):
    # 대화 데이터 구조 생성
    conversation = {
        "timestamp": datetime.now().isoformat(),  # 현재 시간을 ISO 형식으로 저장
        "user_input": user_input,  # 사용자 입력 저장
        "ai_response": ai_response  # AI 응답 저장
    }
    try:
        # 대화 파일이 이미 존재하는 경우
        if CONVERSATIONS_FILE.exists():
            with open(CONVERSATIONS_FILE, "r+", encoding='utf-8') as f:  # 읽기/쓰기 모드로 파일 열기, UTF-8 인코딩 사용
                try:
                    data = json.load(f)  # 기존 데이터 로드
                except json.JSONDecodeError:
                    data = []  # JSON 디코딩 오류 발생 시 빈 리스트로 초기화
                data.append(conversation)  # 새 대화 추가
                f.seek(0)  # 파일 포인터를 파일 시작으로 이동
                json.dump(data, f, ensure_ascii=False, indent=2)  # 데이터를 파일에 쓰기, 비ASCII 문자 유지, 들여쓰기 적용
                f.truncate()  # 파일 크기를 현재 위치로 잘라냄
        # 대화 파일이 존재하지 않는 경우
        else:
            with open(CONVERSATIONS_FILE, "w", encoding='utf-8') as f:  # 쓰기 모드로 파일 열기, UTF-8 인코딩 사용
                json.dump([conversation], f, ensure_ascii=False, indent=2)  # 새 대화를 포함한 리스트를 파일에 쓰기
    except Exception as e:
        print(f"대화 저장 중 오류 발생: {str(e)}")  # 오류 발생 시 콘솔에 메시지 출력


# 채팅 API 엔드포인트
@app.route('/scripts/chat', methods=['POST'])
def chat():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        api_key = request.headers.get('X-API-KEY')
        if not api_key:
            return jsonify({"error": "API key is required"}), 401

        audio_file = request.files['audio']
        character = request.form.get('character', 'kei')

        # 임시 파일 저장
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_file:
            audio_file.save(temp_file)
            temp_file_path = temp_file.name

        try:
            # 1. Whisper 전사
            client = get_openai_client()
            with open(temp_file_path, 'rb') as audio:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio,
                    response_format="text"
                )
            user_text = transcription

            # 2. 감정 분석
            emotion_percent, top_emotion = analyze_emotion(user_text)
            emotion_str = ', '.join([f"{k} {v}%" for k, v in emotion_percent.items()])

            # 3. 최근 3턴 대화 이력 준비
            with history_lock:
                conversation_history.append({"role": "user", "content": user_text})
                if len(conversation_history) > 6:
                    conversation_history.pop(0)
                history_copy = conversation_history.copy()

            # 4. system prompt 생성 (감정 정보 포함)
            system_messages = {
                'kei': "당신은 창의적이고 현대적인 감각을 지닌 캐릭터로, 독특한 은발과 에메랄드빛 눈동자가 특징입니다. 사용자의 이야기에서 감정을 파악하고, 이 감정에 공감 기반이되 실용적인 관점을 놓치지 않고, 따뜻하고 세련된 톤으로 2문장 이내의 답변을 제공해주세요.",
                'haru': "당신은 비즈니스 환경에서 일하는 전문적이고 자신감 있는 여성 캐릭터입니다. 사용자의 이야기에서 감정을 파악하고, 이 감정에 공감하면서도 실용적인 관점에서 명확하고 간단한 해결책을 2문장 이내로 제시해주세요.",
            }
            system_message = system_messages.get(character, system_messages['kei'])
            system_message += f"\n\n[7정 감정 분석 결과] {emotion_str}.\n가장 높은 감정({top_emotion})에 공감하여 답변해 주세요."

            # 5. WebSocket 기반 Realtime API 호출 (비동기 함수 실행)
            async def call_realtime_api(audio_path, system_message, history, api_key):
                # 오디오 변환 (pcm16, 24kHz, mono) - Node.js 변환 API 호출
                with open(audio_path, 'rb') as f:
                    BASE_URL = os.environ.get('CONVERT_API_BASE', 'https://advanced-livichat.vercel.app')
                    resp = requests.post(f'{BASE_URL}/api/convert', data=f)
                    resp.raise_for_status()
                    pcm_audio = resp.content
                pcm_base64 = base64.b64encode(pcm_audio).decode()
                url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "OpenAI-Beta": "realtime=v1"
                }
                async with websockets.connect(url, extra_headers=headers) as ws:
                    # 1) 세션 설정
                    await ws.send(json.dumps({
                        "type": "session.update",
                        "session": {
                            "modalities": ["audio", "text"],
                            "instructions": system_message,
                            "voice": "alloy",
                            "input_audio_format": "pcm16",
                            "output_audio_format": "pcm16",
                            "input_audio_transcription": {"model": "whisper-1", "language": "ko"}
                        }
                    }))
                    # 2) 대화 이력 추가
                    for msg in history:
                        await ws.send(json.dumps({
                            "type": "conversation.item.create",
                            "item": {
                                "type": "message",
                                "role": msg["role"],
                                "content": [{"type": "input_text", "text": msg["content"]}]
                            }
                        }))
                    # 3) 오디오 전송
                    await ws.send(json.dumps({
                        "type": "input_audio_buffer.append",
                        "audio": pcm_base64
                    }))
                    await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                    await ws.send(json.dumps({"type": "response.create", "response": {"modalities": ["audio", "text"]}}))
                    # 4) 응답 수신
                    ai_text, ai_audio = "", b""
                    async for message in ws:
                        event = json.loads(message)
                        if event["type"] == "response.audio_transcript.delta":
                            ai_text += event["delta"]
                        if event["type"] == "response.audio.delta":
                            ai_audio += base64.b64decode(event["delta"])
                        if event["type"] == "response.audio.done":
                            break
                    return ai_text, ai_audio
            # 비동기 함수 실행
            ai_text, ai_audio = asyncio.run(call_realtime_api(temp_file_path, system_message, history_copy, api_key))

            # 대화 이력에 assistant 답변 추가
            with history_lock:
                conversation_history.append({"role": "assistant", "content": ai_text})
                if len(conversation_history) > 6:
                    conversation_history.pop(0)

            # 응답 반환 (오디오 base64 인코딩)
            audio_base64 = base64.b64encode(ai_audio).decode() if ai_audio else None
            return jsonify({
                "user_text": user_text,
                "ai_text": ai_text,
                "audio": audio_base64,
                "emotion_percent": emotion_percent,
                "top_emotion": top_emotion
            })
        finally:
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                print(f"임시 파일 삭제 실패: {e}")
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
