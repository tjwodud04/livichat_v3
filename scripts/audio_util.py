import numpy as np
from ffmpeg import FFmpeg

def convert_webm_to_pcm16(webm_data: bytes):
    """
    python-ffmpeg로 WebM 데이터를 24kHz, 모노, 16bit PCM(numpy array)로 변환
    """
    try:
        ffmpeg = (
            FFmpeg(executable="./scripts/ffmpeg")
            .input("pipe:0")  # stdin
            .output(
                "pipe:1", 
                {"codec:a": "pcm_s16le"},  # 오디오 코덱
                ac=1,     # 채널 수
                ar=24000, # 샘플링 레이트
                f="s16le" # 포맷(-f)
            )
        )

        # raw bytes를 stdin으로 넘기고, stdout으로부터 PCM 바이트를 받아옴
        pcm_bytes = ffmpeg.execute(webm_data)

        # NumPy 배열로 변환
        samples = np.frombuffer(pcm_bytes, dtype=np.int16)
        return samples

    except Exception as e:
        print(f"Audio conversion error: {e}")
        return None
