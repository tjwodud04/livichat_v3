import os
import base64
import asyncio
import threading
import json
import requests
import datetime
import re

from flask import Flask, request, jsonify, abort, render_template
from flask_cors import CORS
from openai import AsyncOpenAI
from urllib.parse import urlparse, urlunparse

VERCEL_TOKEN = os.getenv("VERCEL_TOKEN")
VERCEL_PROJ_ID = os.getenv("VERCEL_PROJECT_ID")

app = Flask(
    __name__,
    static_folder='../front',
    static_url_path='',
    template_folder='../front'
)
CORS(app)

# --- 캐릭터 페르소나 ---
CHARACTER_SYSTEM_PROMPTS = {
    "kei": "당신은 창의적이고 현대적인 감각을 지닌 캐릭터입니다. 사용자의 감정에 공감하며 따뜻하게 대화합니다.",
    "haru": "당신은 비즈니스 환경에서 일하는 전문적이고 자신감 있는 여성 캐릭터입니다. 사용자의 이야기에서 감정을 파악하고, 이 감정에 공감하면서도 실용적인 관점에서 명확하게 대화합니다."
}

# 캐릭터별 OpenAI voice 매핑
CHARACTER_VOICE = {
    "kei": "alloy",
    "haru": "shimmer"
}

# --- 대화 이력 관리 ---
conversation_history = []
history_lock = threading.Lock()
HISTORY_MAX_LEN = 10

# --- Helper Functions ---
def get_openai_client(api_key: str):
    if not api_key:
        abort(401, description="OpenAI API 키가 필요합니다.")
    return AsyncOpenAI(api_key=api_key)

def upload_log_to_vercel_blob(blob_name: str, data: dict):
    """Vercel Blob Storage에 base64-encoded JSON 로그 업로드"""
    if not VERCEL_TOKEN or not VERCEL_PROJ_ID:
        print("Vercel 환경변수(VERCEL_TOKEN, VERCEL_PROJECT_ID)가 없어 로그를 저장하지 않습니다.")
        return
    try:
        b64_data = base64.b64encode(json.dumps(data, ensure_ascii=False).encode()).decode()
        resp = requests.post(
            "https://api.vercel.com/v2/blob",
            headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
            json={"projectId": VERCEL_PROJ_ID, "data": b64_data, "name": blob_name}
        )
        resp.raise_for_status()
        print(f"로그 저장 성공: {blob_name}")
    except Exception as e:
        print(f"Vercel Blob 로그 업로드 예외: {e}")

def remove_empty_parentheses(text):
    return re.sub(r'\(\s*\)', '', text)

def prettify_message(text):
    text = remove_empty_parentheses(text)
    text = re.sub(r'\s{2,}', ' ', text)
    text = re.sub(r'링크:\s*', '\n링크: ', text)
    return text.strip()

# --- Flask Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/scripts/chat', methods=['POST'])
async def chat():
    try:
        if 'audio' not in request.files:
            return jsonify(error="오디오 파일이 필요합니다."), 400
        api_key = request.headers.get('X-API-KEY')
        character = request.form.get('character', 'kei')
        client = get_openai_client(api_key)

        # 1. Whisper STT
        audio_file = request.files['audio']
        stt_result = await client.audio.transcriptions.create(
            file=("audio.webm", audio_file.read()),
            model="whisper-1",
            response_format="text"
        )
        user_text = stt_result

        # 2. 감정 분석
        emotion_resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": '다음 문장에서 불교의 칠정(희,노,애,낙,애(사랑),오,욕)에 대해 JSON 형식({"percent": {...}, "top_emotion": "감정"})으로 분석해줘.'},
                {"role": "user", "content": user_text}
            ],
            temperature=0.0,
            max_tokens=200,
            response_format={"type": "json_object"}
        )
        emotion_data = json.loads(emotion_resp.choices[0].message.content)
        emotion_percent = emotion_data.get("percent", {})
        top_emotion = emotion_data.get("top_emotion", "희")

        # 3. 메인 답변 생성
        system_prompt = CHARACTER_SYSTEM_PROMPTS[character]
        with history_lock:
            messages = [{"role": "system", "content": system_prompt}] + conversation_history[-HISTORY_MAX_LEN:]

        # 감정에 따라 분기하여 웹 검색 여부 및 프롬프트 조정
        needs_web_search = top_emotion in ["노", "애", "오"]
        ai_text = ""
        audio_b64 = ""
        youtube_link = None

        if needs_web_search:
            user_prompt = (
                f"{user_text}\n"
                f"(사용자가 '{top_emotion}' 감정을 느끼고 있습니다. 따뜻한 위로의 말과 함께 웹 검색을 사용해 관련된 위로가 되는 유튜브 음악 URL을 찾아 제안해주세요.)\n"
                "아래와 같은 구조로 2~3문장 이내로 답변하세요:\n"
                "1. 공감의 한마디\n"
                "2. 상황에 어울리는 제안(이럴 때는 ~ 어떤가요?)\n"
                "3. 제안에 대한 간단한 설명"
            )
            messages.append({"role": "user", "content": user_prompt})

            # --- web search + tts ---
            search_response = await client.chat.completions.create(
                model="gpt-4o-mini-search-preview",
                messages=messages,
                temperature=0.7,
                max_tokens=512,
            )
            result = search_response.choices[0]
            content = result.message.content
            annotations = getattr(result.message, 'annotations', None) or []

            # 하이퍼링크 변환 (간단 예시)
            ai_text = content
            link_list = []
            for ann in annotations:
                if ann.get("type") == "url_citation":
                    url = ann["url_citation"]["url"]
                    start = ann["url_citation"]["start_index"]
                    end = ann["url_citation"]["end_index"]
                    link_text = content[start:end]
                    a_tag = f'<a href="{url}" target="_blank">{link_text}</a>'
                    ai_text = ai_text[:start] + a_tag + ai_text[end:]
                    link_list.append(url)
            # TTS용 텍스트 (링크 부분 제거)
            tts_text = content
            offset = 0
            for ann in annotations:
                if ann.get("type") == "url_citation":
                    start = ann["url_citation"]["start_index"] - offset
                    end = ann["url_citation"]["end_index"] - offset
                    tts_text = tts_text[:start] + tts_text[end:]
                    offset += (end - start)
            tts_text = tts_text.strip()

            # 음성 생성 (gpt-4o-mini-tts)
            audio_response = await client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice=CHARACTER_VOICE[character],
                input=tts_text
            )
            audio_b64 = base64.b64encode(audio_response.content).decode()
            youtube_link = link_list[0] if link_list else None

        else:
            # 비검색 분기: user_prompt 생성
            if top_emotion in ["희", "낙", "애(사랑)"]:
                user_prompt = (
                    f"{user_text}\n"
                    f"(사용자가 '{top_emotion}' 감정을 느끼고 있습니다. 어떤 상황인지 구체적으로 질문하며 공감해주세요.)\n"
                )
            elif top_emotion == "욕":
                user_prompt = (
                    f"{user_text}\n"
                    f"(사용자가 '{top_emotion}' 감정을 느끼고 있습니다. 응원의 메시지를 보내주세요.)\n"
                )
            else:
                user_prompt = (
                    f"{user_text}\n"
                    "아래와 같은 구조로 2~3문장 이내로 답변하세요:\n"
                    "1. 공감의 한마디\n"
                    "2. 상황에 어울리는 제안(이럴 때는 ~ 어떤가요?)\n"
                    "3. 제안에 대한 간단한 설명"
                )
            messages.append({"role": "user", "content": user_prompt})

            # --- audio-preview ---
            audio_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "system", "content": "아래 텍스트를 읽을 때, '링크:' 이후의 URL은 읽지 마세요."},
                {"role": "user", "content": user_prompt}
            ]
            response = await client.chat.completions.create(
                model="gpt-4o-mini-audio-preview",
                modalities=["text", "audio"],
                audio={"voice": CHARACTER_VOICE[character], "format": "wav"},
                messages=audio_messages,
                temperature=0.7,
                max_tokens=512,
            )
            ai_text = response.choices[0].message.content or ""
            audio_b64 = response.choices[0].message.audio.data
            youtube_link = None

        # 4. 대화 기록 갱신 및 로그 저장
        with history_lock:
            conversation_history.append({"role": "user", "content": user_text})
            conversation_history.append({"role": "assistant", "content": ai_text})
            if len(conversation_history) > HISTORY_MAX_LEN:
                conversation_history[:] = conversation_history[-HISTORY_MAX_LEN:]

        log_data = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z",
            "character": character,
            "user_text": user_text,
            "emotion_percent": emotion_percent,
            "top_emotion": top_emotion,
            "ai_text": ai_text
        }
        now = datetime.datetime.now(datetime.timezone.utc)
        blob_name = f"logs/{now.strftime('%Y-%m-%dT%H-%M-%SZ')}_{character}.json"
        asyncio.create_task(asyncio.to_thread(upload_log_to_vercel_blob, blob_name, log_data))

        # 5. 최종 응답 (별도 link 필드 추가)
        return jsonify({
            "user_text": user_text,
            "ai_text": remove_empty_parentheses(ai_text),
            "audio": audio_b64,
            "emotion_percent": emotion_percent,
            "top_emotion": top_emotion,
            "link": youtube_link
        })

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Failed to process request: {e}"}), 500

if __name__ == '__main__':
    app.run(port=8001, debug=True)
