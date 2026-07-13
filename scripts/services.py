# scripts/services.py
"""Optional side services for the LiviChat backend.

Currently this is just best-effort conversation logging to Vercel Blob. Text
utilities live in ``scripts/utils.py``; this module intentionally does not
duplicate them.
"""
import base64
import json

import requests

from scripts.config import VERCEL_PROJ_ID, VERCEL_TOKEN

VERCEL_BLOB_API_URL = "https://api.vercel.com/v2/blob"


def upload_log_to_vercel_blob(blob_name: str, data: dict) -> None:
    """Upload a conversation log to Vercel Blob when credentials are configured.

    Best-effort: any failure is logged and swallowed so it never breaks the
    request that triggered it.
    """
    if not VERCEL_TOKEN or not VERCEL_PROJ_ID:
        print("Vercel 환경변수(VERCEL_TOKEN, VERCEL_PROJECT_ID)가 없어 로그를 저장하지 않습니다.")
        return
    try:
        b64_data = base64.b64encode(json.dumps(data, ensure_ascii=False).encode()).decode()
        resp = requests.post(
            VERCEL_BLOB_API_URL,
            headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
            json={"projectId": VERCEL_PROJ_ID, "data": b64_data, "name": blob_name},
        )
        resp.raise_for_status()
        print(f"로그 저장 성공: {blob_name}")
    except Exception as exc:  # noqa: BLE001 - logging must never break a request
        print(f"Vercel Blob 로그 업로드 예외: {exc}")
