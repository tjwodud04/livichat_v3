# scripts/services.py
# Simplified version for OpenAI Realtime API integration
import base64
import json
import requests
import datetime
import re
from typing import Dict, Any

from flask import jsonify, abort

from scripts.config import (
    VERCEL_TOKEN, VERCEL_PROJ_ID,
    CHARACTER_SYSTEM_PROMPTS, CHARACTER_VOICE,
    HISTORY_MAX_LEN
)

# ======================================================================================
# Vercel Blob 로깅 (선택적)
# ======================================================================================
def upload_log_to_vercel_blob(blob_name: str, data: dict):
    """Vercel Blob에 대화 로그 업로드"""
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

# ======================================================================================
# 텍스트 유틸리티
# ======================================================================================
def remove_empty_parentheses(text: str) -> str:
    """빈 괄호 제거"""
    return re.sub(r'\(\s*\)', '', text).strip()

def remove_emojis(text: str) -> str:
    """이모지 제거"""
    emoji_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"
        u"\U0001F300-\U0001F5FF"
        u"\U0001F680-\U0001F6FF"
        u"\U0001F1E0-\U0001F1FF"
        u"\U00002702-\U000027B0"
        u"\U000024C2-\U0001F251"
        "]+", flags=re.UNICODE)
    return emoji_pattern.sub(r'', text)
