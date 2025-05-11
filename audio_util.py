import io
from pydub import AudioSegment
import numpy as np
import os
import stat

def ensure_executable(path):
    try:
        st = os.stat(path)
        os.chmod(path, st.st_mode | stat.S_IEXEC)
    except Exception as e:
        print(f'실행 권한 부여 실패: {path} - {e}')

# ffmpeg, ffprobe 경로를 bin 폴더로 직접 지정
ffmpeg_path = '../bin/ffmpeg'
ffprobe_path = '../bin/ffprobe'
ensure_executable(ffmpeg_path)
ensure_executable(ffprobe_path)
AudioSegment.converter = ffmpeg_path
AudioSegment.ffprobe = ffprobe_path

def convert_webm_to_pcm16(webm_data):
    try:
        # WebM 데이터를 AudioSegment로 로드
        audio = AudioSegment.from_file(io.BytesIO(webm_data), format="webm")

        # 24kHz, 모노로 변환
        audio = audio.set_frame_rate(24000).set_channels(1)

        # PCM 16-bit로 변환
        samples = np.array(audio.get_array_of_samples())

        # 볼륨 정규화 (선택적)
        if audio.rms > 0:
            target_db = -20
            change_in_db = target_db - audio.dBFS
            normalized_audio = audio.apply_gain(change_in_db)
            samples = np.array(normalized_audio.get_array_of_samples())

        # 리틀 엔디안으로 변환
        return samples.astype(np.int16).tobytes()
    except Exception as e:
        print(f"Audio conversion error: {str(e)}")
        return None