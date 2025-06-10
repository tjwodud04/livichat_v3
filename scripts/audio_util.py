import io
import numpy as np
from ffmpeg import FFmpeg

def convert_webm_to_pcm16(webm_data):
    """
    python-ffmpeg를 사용해 webm 데이터를 24kHz, 모노, 16bit PCM(numpy array)로 변환합니다.
    ffmpeg/ffprobe 바이너리 경로 문제 없이 메모리에서 바로 처리할 수 있습니다.
    """
    try:
        input_buffer = io.BytesIO(webm_data)
        output_buffer = io.BytesIO()

        # ffmpeg 명령어를 파이프 기반으로 실행
        ffmpeg = (
            FFmpeg()
            .input('pipe:0')
            .output('pipe:1', format='s16le', acodec='pcm_s16le', ar=24000, ac=1)
        )
        # ffmpeg.execute(input=input_buffer, output=output_buffer)
        ffmpeg.execute(input_buffer)

        output_buffer.seek(0)
        pcm_bytes = output_buffer.read()
        samples = np.frombuffer(pcm_bytes, dtype=np.int16)
        return samples
    except Exception as e:
        print(f"Audio conversion error: {str(e)}")
        return None
