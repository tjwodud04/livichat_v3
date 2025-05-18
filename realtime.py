from flask import Flask, request, send_from_directory, jsonify
from flask_cors import CORS
from openai import AsyncOpenAI
import os
import base64
from dotenv import load_dotenv
from datetime import datetime
import json
from pathlib import Path
import tempfile
import asyncio
from pydub import AudioSegment
import io
from audio_util import convert_webm_to_pcm16

load_dotenv()

app = Flask(__name__, static_url_path='', static_folder='front')
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://127.0.0.1:8000", "http://localhost:8000"],
        "methods": ["POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "X-API-KEY"]
    }
})

BASE_DIR = Path(__file__).resolve().parent
CONVERSATIONS_FILE = BASE_DIR / "conversations.json"

async def get_openai_client(api_key=None):
    if not api_key:
        api_key = os.getenv("OPENAI_API_KEY")
    return AsyncOpenAI(api_key=api_key)


def save_conversation(user_input: str, ai_response: str):
    conversation = {
        "timestamp": datetime.now().isoformat(),
        "user_input": user_input,
        "ai_response": ai_response
    }
    try:
        if CONVERSATIONS_FILE.exists():
            with open(CONVERSATIONS_FILE, "r+", encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    data = []
                data.append(conversation)
                f.seek(0)
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.truncate()
        else:
            with open(CONVERSATIONS_FILE, "w", encoding='utf-8') as f:
                json.dump([conversation], f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"대화 저장 중 오류 발생: {str(e)}")


@app.route('/')
def index():
    try:
        return send_from_directory('front', 'index.html')
    except Exception as e:
        print(f"Error serving index.html: {str(e)}")
        return "Error loading page", 500


@app.route('/favicon.ico')
def favicon():
    return "", 204


@app.route('/css/<path:path>')
def serve_css(path):
    return send_from_directory('front/css', path)


@app.route('/js/<path:path>')
def serve_js(path):
    return send_from_directory('front/js', path)


@app.route('/front/<path:path>')
def serve_static(path):
    return send_from_directory('front', path)


@app.route('/model/<path:path>')
def serve_model(path):
    return send_from_directory('model', path)


async def process_audio_with_realtime(audio_file_path, character='momose', client=None):
    try:
        if not client:
            client = await get_openai_client()

        system_message = """
            당신은 고등학교에 다니는 여학생 캐릭터이며, 귀엽고 수줍은 성격을 가졌습니다.
            사용자의 이야기에 자연스럽게 공감하면서 간결하고 친근한 톤으로, 각 답변을 2문장 이내로 제공해주세요.
        """

        print("Initializing session...")
        await client.beta.realtime.connect(
            model="gpt-4o-realtime-preview",
            session={
                'modalities': ['audio', 'text'],
                'instructions': system_message,
                'voice': 'alloy',
                'input_audio_format': 'pcm16',
                'output_audio_format': 'pcm16',
                'input_audio_transcription': {
                    'model': 'whisper-1',
                    'language': 'ko'
                }
            }
        )

        print("Reading audio file...")
        with open(audio_file_path, 'rb') as audio_file:
            audio_data = audio_file.read()

        print("Converting audio format...")
        pcm_audio = convert_webm_to_pcm16(audio_data)
        if pcm_audio is None:
            return "음성 변환에 실패했습니다.", "죄송해요, 다시 한 번 말씀해 주시겠어요?", None

        print("Encoding audio data...")
        audio_content = base64.b64encode(pcm_audio).decode('utf-8')

        print("Creating conversation item...")
        await client.beta.realtime.conversation.item.create(
            item={
                "type": "message",
                "role": "user",
                "content": [{
                    "type": "input_audio",
                    "audio": audio_content
                }]
            }
        )

        print("Creating response...")
        await client.beta.realtime.response.create()

        user_text = ""
        ai_text = ""
        ai_audio = None

        print("Processing events...")
        async for event in client.beta.realtime.conversation:
            print(f"Received event: {event.type}")

            if event.type == 'conversation.item.input_audio_transcription.completed':
                user_text = event.transcript
                print(f"Transcription: {user_text}")

            elif event.type == 'response.audio.delta':
                if ai_audio is None:
                    ai_audio = event.delta
                else:
                    ai_audio += event.delta

            elif event.type == 'response.text.delta':
                ai_text += event.delta
                print(f"AI text delta: {event.delta}")

            elif event.type == "response.done":
                print("Response completed")
                break

        if not user_text.strip():
            user_text = "음성 입력이 감지되지 않았습니다."
        if not ai_text.strip():
            ai_text = "죄송해요, 말씀하신 내용을 잘 이해하지 못했어요. 다시 말씀해 주시겠어요?"

        print(f"Final response - User: {user_text}, AI: {ai_text}")
        return user_text, ai_text, ai_audio

    except Exception as e:
        print(f"Error in audio processing: {str(e)}")
        import traceback
        traceback.print_exc()
        return "오류가 발생했습니다.", "죄송해요, 문제가 생겼네요. 다시 시도해 주시겠어요?", None


@app.route('/api/chat', methods=['POST'])
async def chat():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        api_key = request.headers.get('X-API-KEY')
        if not api_key:
            return jsonify({"error": "API key is required"}), 401

        audio_file = request.files['audio']

        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_file:
            temp_file.write(audio_file.read())
            temp_file_path = temp_file.name

        try:
            client = await get_openai_client(api_key)
            user_text, ai_text, ai_audio = await process_audio_with_realtime(temp_file_path, client=client)

            # 대화 저장
            save_conversation(user_text, ai_text)

            return jsonify({
                "user_text": user_text,
                "ai_text": ai_text,
                "audio": ai_audio,
            })

        finally:
            try:
                os.unlink(temp_file_path)
            except Exception as e:
                print(f"임시 파일 삭제 실패: {e}")

    except Exception as e:
        print(f"Chat endpoint 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8001, debug=True)
