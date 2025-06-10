import numpy as np
from ffmpeg import FFmpeg

def convert_webm_to_pcm16(webm_data: bytes) -> np.ndarray | None:
    """
    Convert WebM audio bytes to 24 kHz, mono, 16-bit PCM (numpy array)
    using python-ffmpeg’s pipe API.
    """
    try:
        ffmpeg = (
            FFmpeg()
            # feed data in via stdin
            .input('pipe:0')
            # output raw PCM on stdout:
            #  -acodec pcm_s16le
            #  -ar 24000
            #  -ac 1
            #  -f s16le
            .output(
                'pipe:1',
                acodec='pcm_s16le',
                ar=24000,
                ac=1,
                f='s16le',
            )
        )
        # execute(ffmpeg_stream) returns stdout bytes
        pcm_bytes = ffmpeg.execute(webm_data)
        # interpret as int16 PCM
        samples = np.frombuffer(pcm_bytes, dtype=np.int16)
        return samples
    except Exception as e:
        print(f"Audio conversion error: {e}")
        return None
