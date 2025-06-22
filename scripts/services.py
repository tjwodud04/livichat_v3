import base64
import asyncio
import threading
import json
import requests
import datetime
import random
import re
from flask import jsonify, abort
from openai import AsyncOpenAI
from scripts.config import VERCEL_TOKEN, VERCEL_PROJ_ID, CHARACTER_SYSTEM_PROMPTS, CHARACTER_VOICE, EMOTION_LINKS, HISTORY_MAX_LEN
from scripts.utils import remove_empty_parentheses, markdown_to_html_links, extract_first_markdown_url, remove_emojis

conversation_history = []
history_lock = threading.Lock()

def get_openai_client(api_key: str):
    if not api_key:
        abort(401, description="OpenAI API 키가 필요합니다.")
    return AsyncOpenAI(api_key=api_key)

def upload_log_to_vercel_blob(blob_name: str, data: dict):
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

async def process_chat(request):
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

        needs_web_search = top_emotion in ["노", "애", "오"]
        ai_text = ""
        audio_b64 = ""

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

            search_response = await client.chat.completions.create(
                model="gpt-4o-mini-search-preview",
                messages=messages,
            )
            result = search_response.choices[0]
            content = result.message.content
            annotations = getattr(result.message, 'annotations', None) or []

            ai_text = content
            link_list = []
            for ann in annotations:
                if getattr(ann, "type", None) == "url_citation":
                    url = ann.url_citation.url
                    start = ann.url_citation.start_index
                    end = ann.url_citation.end_index
                    link_text = content[start:end]
                    a_tag = f'<a href="{url}" target="_blank">{link_text}</a>'
                    ai_text = ai_text[:start] + a_tag + ai_text[end:]
                    link_list.append(url)
            ai_text = markdown_to_html_links(ai_text)
            if link_list:
                youtube_link = link_list[0]
            else:
                youtube_link = extract_first_markdown_url(content)
                if not youtube_link:
                    candidates = EMOTION_LINKS.get(top_emotion, [])
                    if candidates:
                        _, youtube_link = random.choice(candidates)
                    else:
                        youtube_link = None
            if youtube_link and youtube_link not in ai_text:
                ai_text += f'<br><a href="{youtube_link}" target="_blank">▶️ 추천 음악 바로 듣기</a>'
            # tts_text = content
            tts_text = remove_empty_parentheses(content)
            tts_text = remove_emojis(tts_text)            
            offset = 0
            
            for ann in annotations:
                if getattr(ann, "type", None) == "url_citation":
                    start = ann.url_citation.start_index - offset
                    end = ann.url_citation.end_index - offset
                    tts_text = tts_text[:start] + tts_text[end:]
                    offset += (end - start)
            tts_text = tts_text.strip()

            audio_response = await client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice=CHARACTER_VOICE[character],
                input=tts_text
            )
            audio_b64 = base64.b64encode(audio_response.content).decode()
        else:
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

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                temperature=0.7,
                max_tokens=512,
            )
            ai_text = response.choices[0].message.content or ""
            # 추가 문구
            ai_text = remove_emojis(ai_text)
            
            if not ai_text:
                ai_text = "아직 답변을 준비하지 못했어요. 다시 한 번 말씀해주시겠어요?"

            tts_text = re.sub(r'링크:.*', '', ai_text).strip()
            # 추가 문구
            tts_text = remove_emojis(tts_text)

            audio_response = await client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice=CHARACTER_VOICE[character],
                input=tts_text
            )
            audio_b64 = base64.b64encode(audio_response.content).decode()
            youtube_link = None

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