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
import websockets  # WebSocket 연결용
import asyncio
import functools

# 새로 만든 코어 로직 임포트
from scripts.voice_agent_core import create_voice_pipeline

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

# --- 멀티턴 대화 이력(최근 3턴) 관리용 (메모리, 유저별 구분 없음) ---
# conversation_history = []  # 현재 사용되지 않으므로 주석 처리
# history_lock = threading.Lock() # 현재 사용되지 않으므로 주석 처리

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
    import ast, re
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


# 대화 내용을 저장하는 함수 (현재 호출되지 않음, 필요시 주석 해제하여 사용)
# def save_conversation(user_input: str, ai_response: str):
#     # 대화 데이터 구조 생성
#     conversation = {
#         "timestamp": datetime.now().isoformat(),  # 현재 시간을 ISO 형식으로 저장
#         "user_input": user_input,  # 사용자 입력 저장
#         "ai_response": ai_response  # AI 응답 저장
#     }
#     try:
#         # 대화 파일이 이미 존재하는 경우
#         if CONVERSATIONS_FILE.exists():
#             with open(CONVERSATIONS_FILE, "r+", encoding='utf-8') as f:  # 읽기/쓰기 모드로 파일 열기, UTF-8 인코딩 사용
#                 try:
#                     data = json.load(f)  # 기존 데이터 로드
#                 except json.JSONDecodeError:
#                     data = []  # JSON 디코딩 오류 발생 시 빈 리스트로 초기화
#                 data.append(conversation)  # 새 대화 추가
#                 f.seek(0)  # 파일 포인터를 파일 시작으로 이동
#                 json.dump(data, f, ensure_ascii=False, indent=2)  # 데이터를 파일에 쓰기, 비ASCII 문자 유지, 들여쓰기 적용
#                 f.truncate()  # 파일 크기를 현재 위치로 잘라냄
#         # 대화 파일이 존재하지 않는 경우
#         else:
#             with open(CONVERSATIONS_FILE, "w", encoding='utf-8') as f:  # 쓰기 모드로 파일 열기, UTF-8 인코딩 사용
#                 json.dump([conversation], f, ensure_ascii=False, indent=2)  # 새 대화를 포함한 리스트를 파일에 쓰기
#     except Exception as e:
#         print(f"대화 저장 중 오류 발생: {str(e)}")  # 오류 발생 시 콘솔에 메시지 출력


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
        
        result = await pipeline.run(audio_bytes)
        
        final_result = await result.get_result()
        final_audio_bytes = b"".join([chunk async for chunk in result.audio])
        audio_base64 = base64.b64encode(final_audio_bytes).decode()
        
        # save_conversation(final_result.get("user_text"), final_result.get("ai_text")) # 대화 저장 기능 비활성화

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
