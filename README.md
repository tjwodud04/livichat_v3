# LiviChat_v3

Real-time voice chat with AI-powered Live2D characters using OpenAI Realtime API.

## Features

- Real-time voice conversation with WebRTC
- Live2D animated character responses
- Emotion-aware AI personas (Hiyori, Haru)
- Multi-language support (EN/KO)

## Quick Start

```bash
# Clone & Install
git clone https://github.com/tjwodud04/livichat_v3.git
cd livichat_v3
pip install -r requirements.txt

# Run locally
python scripts/app.py
# Open http://localhost:8001
```

## Tech Stack

| Backend | Frontend | AI |
|---------|----------|-----|
| Flask | Vanilla JS | OpenAI Realtime API |

## Project Structure

```
├── front/          # Static web pages
├── scripts/        # Flask backend
├── model/          # Live2D character models
├── vercel.json     # Vercel config
└── requirements.txt
```

---

# LiviChat_v3 (한국어)

OpenAI Realtime API를 활용한 Live2D 캐릭터와의 실시간 음성 대화 서비스입니다.

## 주요 기능

- WebRTC 기반 실시간 음성 대화
- Live2D 캐릭터 애니메이션 응답
- 감정 인식 AI 페르소나 (히요리, 하루)
- 다국어 지원 (영어/한국어)

## 빠른 시작

```bash
# 복제 & 설치
git clone https://github.com/tjwodud04/livichat_v3.git
cd livichat_v3
pip install -r requirements.txt

# 로컬 실행
python scripts/app.py
# http://localhost:8001 접속
```

## 기술 스택

| 백엔드 | 프론트엔드 | AI |
|--------|-----------|-----|
| Flask | Vanilla JS | OpenAI Realtime API |
