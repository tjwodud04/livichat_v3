# scripts/realtime.py
# OpenAI Realtime API session management for WebRTC connections
import os
import requests
from flask import jsonify, request

from scripts.config import CHARACTER_SYSTEM_PROMPTS, CHARACTER_VOICE


def create_realtime_session():
    """
    Create an ephemeral session token for OpenAI Realtime API WebRTC connection.

    POST /api/realtime/session
    Body: { "character": "hiyori" | "haru" }
    Returns: { "client_secret": {...}, "session_id": "...", "expires_at": ... }
    """
    try:
        data = request.get_json() or {}
        character = data.get('character', 'hiyori')

        # Validate character
        if character not in CHARACTER_SYSTEM_PROMPTS:
            return jsonify({'error': 'Invalid character'}), 400

        # Get character settings
        instructions = CHARACTER_SYSTEM_PROMPTS[character]
        voice = CHARACTER_VOICE.get(character, 'alloy')

        # Get API key from request header (user-provided) or environment
        api_key = request.headers.get('X-API-KEY') or os.getenv('OPENAI_API_KEY')
        if not api_key:
            return jsonify({'error': 'OpenAI API key not configured. Please set your API key in the settings.'}), 400

        # Create ephemeral token via OpenAI Realtime Sessions API
        response = requests.post(
            'https://api.openai.com/v1/realtime/sessions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'gpt-4o-realtime-preview-2024-12-17',
                'voice': voice,
                'instructions': instructions,
                'modalities': ['text', 'audio'],
                'input_audio_format': 'pcm16',
                'output_audio_format': 'pcm16',
                'input_audio_transcription': {
                    'model': 'whisper-1',
                },
                'turn_detection': {
                    'type': 'server_vad',
                    'threshold': 0.5,
                    'prefix_padding_ms': 300,
                    'silence_duration_ms': 800,
                    'create_response': True,
                },
            },
            timeout=30
        )

        if not response.ok:
            error_data = response.json() if response.text else {}
            print(f'OpenAI Realtime API error: {error_data}')
            return jsonify({'error': 'Failed to create realtime session'}), response.status_code

        session = response.json()

        return jsonify({
            'client_secret': session.get('client_secret'),
            'session_id': session.get('id'),
            'expires_at': session.get('client_secret', {}).get('expires_at'),
        })

    except requests.RequestException as e:
        print(f'Realtime session request error: {e}')
        return jsonify({'error': 'Failed to connect to OpenAI API'}), 500
    except Exception as e:
        print(f'Realtime session error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
