import io
from pydub import AudioSegment
import numpy as np
import subprocess
import os
import static_ffmpeg

static_ffmpeg.add_paths(download_dir="/tmp/static_ffmpeg")

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

def convert_audio_with_ffmpeg(input_path, output_path):
    command = [
        'ffmpeg',
        '-i', input_path,
        '-ar', '24000',
        '-ac', '1',
        '-f', 'wav',
        output_path
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        print('ffmpeg error:', result.stderr.decode())
        return False
    return True

def get_audio_info_with_ffprobe(input_path):
    command = [
        'ffprobe',
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
