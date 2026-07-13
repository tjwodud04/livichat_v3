# scripts/realtime.py
"""OpenAI Realtime API (GA) ephemeral session/token handler.

The backend mints a short-lived ephemeral client secret that the browser uses
to open a WebRTC connection straight to the Realtime API, so the user's OpenAI
key is never exposed to client-side code. GA endpoint/model/audio constants
live in ``scripts/config.py``.

Docs: https://developers.openai.com/api/docs/guides/realtime-webrtc
"""
from typing import Any, Dict

import requests
from flask import jsonify, request

from scripts.config import (
    CHARACTER_SYSTEM_PROMPTS,
    CHARACTER_VOICE,
    DEFAULT_CHARACTER,
    DEFAULT_VOICE,
    OPENAI_REALTIME_CLIENT_SECRETS_URL,
    REALTIME_AUDIO_FORMAT,
    REALTIME_MODEL,
    REALTIME_OUTPUT_MODALITIES,
    REALTIME_REQUEST_TIMEOUT,
    REALTIME_SESSION_TYPE,
    REALTIME_TRANSCRIPTION_MODEL,
    REALTIME_VAD_PREFIX_PADDING_MS,
    REALTIME_VAD_SILENCE_DURATION_MS,
    REALTIME_VAD_THRESHOLD,
    REALTIME_VAD_TYPE,
)


def build_session_config(character: str) -> Dict[str, Any]:
    """Build the GA ``session`` object for a character's realtime connection.

    Args:
        character: A key present in ``CHARACTER_SYSTEM_PROMPTS``.

    Returns:
        The ``session`` payload for ``POST /v1/realtime/client_secrets``.
    """
    return {
        "type": REALTIME_SESSION_TYPE,
        "model": REALTIME_MODEL,
        "instructions": CHARACTER_SYSTEM_PROMPTS[character],
        "output_modalities": list(REALTIME_OUTPUT_MODALITIES),
        "audio": {
            "input": {
                "format": REALTIME_AUDIO_FORMAT,
                "transcription": {"model": REALTIME_TRANSCRIPTION_MODEL},
                "turn_detection": {
                    "type": REALTIME_VAD_TYPE,
                    "threshold": REALTIME_VAD_THRESHOLD,
                    "prefix_padding_ms": REALTIME_VAD_PREFIX_PADDING_MS,
                    "silence_duration_ms": REALTIME_VAD_SILENCE_DURATION_MS,
                    "create_response": True,
                    "interrupt_response": True,
                },
            },
            "output": {
                "format": REALTIME_AUDIO_FORMAT,
                "voice": CHARACTER_VOICE.get(character, DEFAULT_VOICE),
            },
        },
    }


def create_realtime_session():
    """Create a GA ephemeral client secret for a WebRTC Realtime connection.

    Request:
        ``POST /api/realtime/session``
        Header ``X-API-KEY``: the user's OpenAI API key.
        Body ``{"character": "hiyori" | "haru"}``.

    Returns:
        A Flask JSON response of the form::

            {"client_secret": {"value": ..., "expires_at": ...},
             "session_id": ..., "expires_at": ...}
    """
    data = request.get_json(silent=True) or {}
    character = data.get("character", DEFAULT_CHARACTER)
    if character not in CHARACTER_SYSTEM_PROMPTS:
        return jsonify({"error": "Invalid character"}), 400

    # The user's API key arrives per-request (also validated upstream in routes).
    api_key = request.headers.get("X-API-KEY", "").strip()
    if not api_key:
        return jsonify({
            "error": "OpenAI API key not configured. Please set your API key in the settings."
        }), 401

    try:
        response = requests.post(
            OPENAI_REALTIME_CLIENT_SECRETS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"session": build_session_config(character)},
            timeout=REALTIME_REQUEST_TIMEOUT,
        )

        if not response.ok:
            error_data = response.json() if response.text else {}
            print(f"OpenAI Realtime API error: {error_data}")
            return jsonify({"error": "Failed to create realtime session"}), response.status_code

        # GA client-secrets response shape: {"value", "expires_at", "session": {...}}.
        payload = response.json()
        expires_at = payload.get("expires_at")
        session = payload.get("session") or {}
        return jsonify({
            "client_secret": {"value": payload.get("value"), "expires_at": expires_at},
            "session_id": session.get("id"),
            "expires_at": expires_at,
        })

    except requests.RequestException as exc:
        print(f"Realtime session request error: {exc}")
        return jsonify({"error": "Failed to connect to OpenAI API"}), 500
    except Exception as exc:  # noqa: BLE001 - map any unexpected failure to a 500
        print(f"Realtime session error: {exc}")
        return jsonify({"error": "Internal server error"}), 500
