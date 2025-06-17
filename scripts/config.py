import os

VERCEL_TOKEN = os.getenv("VERCEL_TOKEN")
VERCEL_PROJ_ID = os.getenv("VERCEL_PROJECT_ID")

CHARACTER_SYSTEM_PROMPTS = {
    "kei": "당신은 창의적이고 현대적인 감각을 지닌 캐릭터입니다. 사용자의 감정에 공감하며 따뜻하게 대화합니다.",
    "haru": "당신은 비즈니스 환경에서 일하는 전문적이고 자신감 있는 여성 캐릭터입니다. 사용자의 이야기에서 감정을 파악하고, 이 감정에 공감하면서도 실용적인 관점에서 명확하게 대화합니다."
}

CHARACTER_VOICE = {
    "kei": "alloy",
    "haru": "shimmer"
}

HISTORY_MAX_LEN = 10

EMOTION_LINKS = {
    "노": [
        ("마음이 편안해지는 음악", "https://www.youtube.com/watch?v=5qap5aO4i9A"),
        ("분노 해소 명상", "https://www.youtube.com/watch?v=O-6f5wQXSu8"),
        ("스트레스 해소 ASMR", "https://www.youtube.com/watch?v=1ZYbU82GVz4"),
    ],
    "애": [
        ("위로가 되는 노래", "https://www.youtube.com/watch?v=8UVNT4wvIGY"),
        ("감성적인 음악", "https://www.youtube.com/watch?v=VYOjWnS4cMY"),
        ("마음을 어루만지는 발라드", "https://www.youtube.com/watch?v=2Vv-BfVoq4g"),
    ],
    "오": [
        ("불안할 때 듣는 음악", "https://www.youtube.com/watch?v=1ZYbU82GVz4"),
        ("마음을 진정시키는 소리", "https://www.youtube.com/watch?v=5qap5aO4i9A"),
        ("힐링 자연 소리", "https://www.youtube.com/watch?v=DWcJFNfaw9c"),
    ],
    "희": [
        ("기분 좋은 팝송", "https://www.youtube.com/watch?v=JGwWNGJdvx8"),
        ("신나는 댄스곡", "https://www.youtube.com/watch?v=OPf0YbXqDm0"),
        ("에너지 넘치는 음악", "https://www.youtube.com/watch?v=ktvTqknDobU"),
    ],
    "낙": [
        ("여유로운 재즈", "https://www.youtube.com/watch?v=Dx5qFachd3A"),
        ("행복한 분위기의 음악", "https://www.youtube.com/watch?v=ZbZSe6N_BXs"),
        ("산뜻한 아침 음악", "https://www.youtube.com/watch?v=6JCLY0Rlx6Q"),
    ],
    "애(사랑)": [
        ("달콤한 사랑 노래", "https://www.youtube.com/watch?v=450p7goxZqg"),
        ("로맨틱 팝송", "https://www.youtube.com/watch?v=09R8_2nJtjg"),
        ("사랑을 담은 발라드", "https://www.youtube.com/watch?v=RgKAFK5djSk"),
    ],
    "욕": [
        ("힘이 되는 응원가", "https://www.youtube.com/watch?v=2vjPBrBU-TM"),
        ("자신감을 북돋는 음악", "https://www.youtube.com/watch?v=QJO3ROT-A4E"),
        ("용기를 주는 노래", "https://www.youtube.com/watch?v=K0ibBPhiaG0"),
    ],
} 