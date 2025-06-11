import os
import base64
import asyncio
import functools
import threading
import json
from flask import Flask, request, jsonify, abort, render_template
from flask_cors import CORS
from openai import OpenAI
from agents import Runner
from agents.voice import AudioInput
from scripts.audio_util import convert_webm_to_pcm16
from scripts.voice_agent_core import create_voice_pipeline, ContentFinderAgent

app = Flask(__name__,
            static_folder='../front',
            static_url_path='',
            template_folder='../front')
CORS(app)

conversation_history = []
history_lock = threading.Lock()
HISTORY_MAX_LEN = 6

def get_openai_client(api_key: str):
    if not api_key:
        abort(401, description="OpenAI API 키가 필요합니다.")
    return OpenAI(api_key=api_key)

async def analyze_emotion(text: str, api_key: str):
    """
    불교 칠정(희·노·애·낙·애(愛)·오·욕)에 대해
    반드시 JSON 형식만 반환하도록 강제합니다.
    """
    client = get_openai_client(api_key)
    prompt = (
        "다음 문장을 분석하여, 반드시 아래 JSON 형식만 출력해 주세요:\n"
        "{\n"
        '  "희":0, "노":0, "애":0, "낙":0, "애(愛)":0, "오":0, "욕":0,\n'
        '  "top_emotion": "희"\n'
        "}\n"
        f"문장: {text}"
    )
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=128,
        temperature=0.0,
    )
    content = response.choices[0].message.content.strip()
    try:
        # JSON 오브젝트 부분만 추출
        obj = json.loads(content)
        # 키 검증
        keys = ["희","노","애","낙","애(愛)","오","욕","top_emotion"]
        if all(k in obj for k in keys):
            percent = {k: obj[k] for k in keys if k != "top_emotion"}
            top_emotion = obj["top_emotion"]
            return percent, top_emotion
    except Exception as e:
        print(f"[analyze_emotion] JSON 파싱 실패: {e}\n원본문자열: {content}")

    # 파싱 실패 시 기본값
    zero = {k: 0 for k in ["희","노","애","낙","애(愛)","오","욕"]}
    return zero, "희"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/scripts/chat', methods=['POST'])
async def chat():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
        api_key = request.headers.get('X-API-KEY')
        if not api_key:
            return jsonify({"error": "X-API-KEY header is required"}), 401
        os.environ['OPENAI_API_KEY'] = api_key

        # 1) WebM → PCM 변환
        webm_bytes = request.files['audio'].read()
        samples = convert_webm_to_pcm16(webm_bytes)
        if samples is None:
            return jsonify({"error": "오디오 변환 실패"}), 500
        audio_input = AudioInput(buffer=samples, frame_rate=24000, sample_width=2, channels=1)

        # 2) STT → user_text
        pipeline = create_voice_pipeline(
            api_key,
            request.form.get('character', 'kei'),
            functools.partial(analyze_emotion, api_key=api_key),
            conversation_history
        )
        user_text = await pipeline._process_audio_input(audio_input)

        # 3) 감정 분석
        emotion_percent, top_emotion = await analyze_emotion(user_text, api_key)

        # 4) 대화 이력 갱신 (user)
        with history_lock:
            conversation_history.append({"role": "user", "content": user_text})
            if len(conversation_history) > HISTORY_MAX_LEN:
                conversation_history.pop(0)

        # 5) 감정 분기
        negative = {'노','애','오'}  # 분노·슬픔·미움에 대응
        if top_emotion in negative:
            prompt = f"{top_emotion} 감정을 완화할 수 있는 영상이나 음악 3개의 URL만 JSON 배열로 반환해 주세요."
            search_run = await Runner.run(ContentFinderAgent, prompt)
            try:
                urls = json.loads(search_run.final_output)
            except:
                urls = []
            ai_text = (
                f"{top_emotion} 감정이 느껴지시는군요. 아래 콘텐츠를 추천드려요:\n" +
                "\n".join(f"{i+1}. {u}" for i, u in enumerate(urls))
            )
        else:
            client = get_openai_client(api_key)
            completion = await asyncio.to_thread(
                client.chat.completions.create,
                model="gpt-4o",
                messages=conversation_history.copy(),
                max_tokens=256,
                temperature=0.7,
            )
            ai_text = completion.choices[0].message.content

        # 6) 대화 이력 갱신 (assistant)
        with history_lock:
            conversation_history.append({"role": "assistant", "content": ai_text})
            if len(conversation_history) > HISTORY_MAX_LEN:
                conversation_history.pop(0)

        # 7) TTS → audio chunks + 로깅
        tts_model = pipeline._get_tts_model()
        tts_settings = pipeline.config.tts_settings
        audio_chunks = []
        async for chunk in tts_model.run(ai_text, tts_settings):
            print(f"[TTS] chunk size: {len(chunk)} bytes")
            audio_chunks.append(chunk)
        raw_pcm = b"".join(audio_chunks)

        # (옵션) PCM → WAV 래핑: WAV 헤더를 추가하려면 여기서 처리
        audio_base64 = base64.b64encode(raw_pcm).decode()

        return jsonify({
            "user_text": user_text,
            "ai_text": ai_text,
            "audio_base64": audio_base64,
            "emotion": top_emotion,
            "emotion_percent": emotion_percent
        })

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Failed to process audio: {e}"}), 500

if __name__ == '__main__':
    app.run(port=8001, debug=True)
