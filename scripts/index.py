# 필요한 모듈 및 라이브러리 임포트
from flask import Flask, request, send_from_directory, jsonify, render_template, abort  # Flask 웹 프레임워크 관련 기능들 임포트
from flask_cors import CORS  # 교차 출처 리소스 공유(CORS) 기능을 제공하는 Flask 확장 임포트
from openai import OpenAI  # OpenAI API와 상호작용하기 위한 클라이언트 임포트
from datetime import datetime  # 날짜 및 시간 관련 기능 임포트
from pathlib import Path  # 파일 경로 관리를 위한 클래스 임포트
from scripts.audio_util import convert_webm_to_pcm16
from agents.voice import AudioInput
# 새로 만든 코어 로직 임포트
from scripts.voice_agent_core import create_voice_pipeline

import base64  # 바이너리 데이터의 인코딩 및 디코딩을 위한 모듈 임포트
import asyncio
import functools
import threading
import ast, re

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
def get_openai_client(api_key):
    if not api_key:
        abort(401, description="OpenAI API 키가 필요합니다.")
    return OpenAI(api_key=api_key)

# --- 멀티턴 대화 이력(최근 3턴) 관리용 (단일 유저, 텍스트 기반) ---
conversation_history = []  # [{role: 'user'|'assistant', content: str} ...]
history_lock = threading.Lock()
HISTORY_MAX_LEN = 6  # user/assistant 3턴씩

# --- 감정 분석 함수 (웹 컨텍스트, API 키 필요) ---
async def analyze_emotion(text: str, api_key: str):
    """입력 텍스트에 대해 7정 감정 비율과 최고 감정을 반환 (비동기)"""
    client = get_openai_client(api_key)
    prompt = (
        "다음 문장에서 유교의 7정(기쁨, 분노, 슬픔, 두려움, 사랑, 미움, 욕심)에 대해 각각 0~100%로 감정 비율을 추정해 주세요. "
        "가장 높은 감정도 함께 알려주세요.\n"
        "출력 예시: {\"기쁨\":10, \"분노\":5, ...}, \"슬픔\"\n"
        f"문장: {text}"
    )
    # Flask의 비동기 환경에서는 asyncio.to_thread를 사용하는 것이 권장됩니다.
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=256,
        temperature=0.0
    )

    content = response.choices[0].message.content
    match = re.match(r'\s*({.*?})\s*,\s*"([^"]+)"', content)
    if match:
        try:
            percent = ast.literal_eval(match.group(1))
            top_emotion = match.group(2)
            if isinstance(percent, dict) and all(k in percent for k in ["기쁨","분노","슬픔","두려움","사랑","미움","욕심"]):
                return percent, top_emotion
        except Exception as e:
            print(f"감정 분석 파싱 오류: {e}")
    return {"기쁨":0, "분노":0, "슬픔":0, "두려움":0, "사랑":0, "미움":0, "욕심":0}, "기쁨"

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

# --- 핵심 채팅 API 엔드포인트 ---
@app.route('/scripts/chat', methods=['POST'])
async def chat():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        api_key = request.headers.get('X-API-KEY')
        if not api_key:
            return jsonify({"error": "X-API-KEY header is required"}), 401
            
        audio_file = request.files['audio']
        character = request.form.get('character', 'kei')

        emotion_analyzer_with_key = functools.partial(analyze_emotion, api_key=api_key)
        
        pipeline = create_voice_pipeline(api_key, character, emotion_analyzer_with_key)

        audio_bytes = audio_file.read()
        
        # webm -> PCM numpy array 변환 후 AudioInput으로 감싸기
        samples = convert_webm_to_pcm16(audio_bytes)
        if samples is None:
            return jsonify({"error": "오디오 변환 실패"}), 500
        audio_input = AudioInput(buffer=samples, frame_rate=24000, sample_width=2, channels=1)

        # --- 대화 이력에 user 발화 추가 ---
        with history_lock:
            conversation_history.append({"role": "user", "content": "(음성 입력)"})  # 실제 텍스트는 pipeline에서 추출됨
            if len(conversation_history) > HISTORY_MAX_LEN:
                conversation_history.pop(0)

        # pipeline에 대화 이력 전달 (CustomHybridWorkflow에서 messages 인자로 받도록 수정 필요)
        result = await pipeline.run(audio_input, history=conversation_history.copy())
        # result.get_result()에서 user_text, ai_text 추출
        final_result = await result.get_result()
        final_audio_bytes = b"".join([chunk async for chunk in result.audio])
        audio_base64 = base64.b64encode(final_audio_bytes).decode()

        # --- 대화 이력에 실제 user_text, assistant 답변 추가 ---
        with history_lock:
            # 마지막 user 발화는 (음성 입력)으로 임시 저장되어 있으니 실제 텍스트로 교체
            if conversation_history and conversation_history[-1]["role"] == "user":
                conversation_history[-1]["content"] = final_result.get("user_text", "(음성 입력)")
            # assistant 답변 추가
            conversation_history.append({"role": "assistant", "content": final_result.get("ai_text", "")})
            if len(conversation_history) > HISTORY_MAX_LEN:
                conversation_history.pop(0)

        return jsonify({
            "user_text": final_result.get("user_text"),
            "ai_text": final_result.get("ai_text"),
            "audio_base64": audio_base64,
            "emotion": final_result.get("emotion"),
            "emotion_percent": final_result.get("emotion_percent"),
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to process audio: {str(e)}"}), 500

if __name__ == '__main__':
    # SSL/TLS 설정이 필요하면 아래 주석을 해제하세요.
    # app.run(host='0.0.0.0', port=8001, ssl_context='adhoc')
    app.run(port=8001, debug=True)
