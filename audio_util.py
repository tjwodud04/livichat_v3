import io
from pydub import AudioSegment
import numpy as np
import subprocess
import os

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

def get_ffmpeg_path():
    # Vercel 환경에서는 프로젝트 루트 기준 상대경로 사용
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'ffmpeg')

def convert_audio_with_ffmpeg(input_path, output_path):
    ffmpeg_path = get_ffmpeg_path()
    command = [
        ffmpeg_path,
        '-i', input_path,
        '-ar', '24000',  # 샘플레이트 24kHz
        '-ac', '1',      # 모노
        '-f', 'wav',
        output_path
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        print('ffmpeg error:', result.stderr.decode())
        return False
    return True

def get_ffprobe_path():
    # Vercel 환경에서는 프로젝트 루트 기준 상대경로 사용
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'ffprobe')

def get_audio_info_with_ffprobe(input_path):
    ffprobe_path = get_ffprobe_path()
    command = [
        ffprobe_path,
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        input_path
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        print('ffprobe error:', result.stderr.decode())
        return None
    duration = result.stdout.decode().strip()
    return {'duration': duration}