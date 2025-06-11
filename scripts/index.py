import os
import io
import base64
import asyncio
import functools
import threading
import re
import ast
from datetime import datetime
from pathlib import Path

import numpy as np
from flask import Flask, request, send_from_directory, jsonify, render_template, abort
from flask_cors import CORS
from openai import OpenAI
from agents.voice.events import VoiceStreamEventAudio, VoiceStreamEventLifecycle
from agents.voice import AudioInput

# 로컬 모듈 임포트
from scripts.audio_util import convert_webm_to_pcm16
from scripts.voice_agent_core import create_voice_pipeline

# Flask 앱 초기화
app = Flask(
    __name__,
    static_folder='../front',
    static_url_path='',
    template_folder='../front'
)
CORS(app)

# 대화 이력 관리
conversation_history = []  # [{'role':..., 'content':...}, ...]
history_lock = threading.Lock()
HISTORY_MAX_LEN = 6  # user/assistant 3턴씩 유지

# 경로 설정
BASE_DIR = Path(__file__).resolve().parent
CONVERSATIONS_FILE = BASE_DIR / "conversations.json"

# OpenAI 클라이언트 생성
def get_openai_client(api_key: str):
    if not api_key:
        abort(401, description="OpenAI API 키가 필요합니다.")
    return OpenAI(api_key=api_key)

# 감정 분석 함수
async def analyze_emotion(text: str, api_key: str):
    client = get_openai_client(api_key)
    prompt = (
        "다음 문장에서 유교의 7정(기쁨, 분노, 슬픔, 두려움, 사랑, 미움, 욕심)에 대해 각각 0~100%로 감정 비율을 추정해 주세요. "
        "가장 높은 감정도 함께 알려주세요.\n"
        f"문장: {text}"
    )
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
            keys = ["기쁨","분노","슬픔","두려움","사랑","미움","욕심"]
            if isinstance(percent, dict) and all(k in percent for k in keys):
                return percent, top_emotion
        except:
            pass
    return {k:0 for k in ["기쁨","분노","슬픔","두려움","사랑","미움","욕심"]}, "기쁨"

# 라우트 핸들러
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/haru')
def haru():
    return render_template('haru.html')

@app.route('/kei')
def kei():
    return render_template('kei.html')

@app.route('/model/<path:filename>')
def serve_model(filename):
    return send_from_directory('../model', filename)

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('../front/css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('../front/js', filename)

@app.route('/scripts/chat', methods=['POST'])
async def chat():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
        api_key = request.headers.get('X-API-KEY')
        if not api_key:
            return jsonify({"error": "X-API-KEY header is required"}), 401

        # 환경변수에 API 키 설정
        os.environ['OPENAI_API_KEY'] = api_key

        audio_file = request.files['audio']
        character = request.form.get('character', 'kei')
        emotion_analyzer = functools.partial(analyze_emotion, api_key=api_key)

        # 파이프라인 생성 (이력 리스트 전달)
        pipeline = create_voice_pipeline(
            api_key,
            character,
            emotion_analyzer,
            conversation_history
        )

        # WebM → PCM 변환
        webm_bytes = audio_file.read()
        samples = convert_webm_to_pcm16(webm_bytes)
        if samples is None:
            return jsonify({"error": "오디오 변환 실패"}), 500
        audio_input = AudioInput(buffer=samples, frame_rate=24000, sample_width=2, channels=1)

        # STT로 사용자 텍스트 추출
        user_text = await pipeline._process_audio_input(audio_input)
        with history_lock:
            conversation_history.append({"role": "user", "content": user_text})
            if len(conversation_history) > HISTORY_MAX_LEN:
                conversation_history.pop(0)

        # 음성 챗 파이프라인 실행 (TTS 포함)
        result = await pipeline.run(audio_input)

        # AI 응답 텍스트
        ai_text = result.total_output_text

        # 오디오 스트림 수집
        audio_chunks = []
        async for event in result.stream():
            if isinstance(event, VoiceStreamEventAudio):
                audio_chunks.append(event.data.tobytes())
            if isinstance(event, VoiceStreamEventLifecycle) and event.event == "session_ended":
                break
        final_audio = b"".join(audio_chunks)
        audio_base64 = base64.b64encode(final_audio).decode()

        with history_lock:
            conversation_history.append({"role": "assistant", "content": ai_text})
            if len(conversation_history) > HISTORY_MAX_LEN:
                conversation_history.pop(0)

        return jsonify({
            "user_text": user_text,
            "ai_text": ai_text,
            "audio_base64": audio_base64,
        })

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Failed to process audio: {e}"}), 500

if __name__ == '__main__':
    app.run(port=8001, debug=True)