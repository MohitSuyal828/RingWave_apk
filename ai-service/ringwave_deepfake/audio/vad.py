import webrtcvad

SAMPLE_RATE = 16_000

class VADGate:
    """30ms-frame WebRTC VAD. aggressiveness 0-3; 2 is a reasonable default
    for telephony (more aggressive = more silence rejected, more risk of
    clipping low-energy speech onsets — tune against your own call data)."""
    def __init__(self, aggressiveness: int = 2):
        self.vad = webrtcvad.Vad(aggressiveness)
        self.frame_samples = int(SAMPLE_RATE * 0.03)  # 480 samples @ 16kHz

    def speech_mask(self, waveform_i16_bytes: bytes) -> list[bool]:
        """Returns a list of booleans indicating speech presence per frame."""
        n_frames = len(waveform_i16_bytes) // (2 * self.frame_samples)
        out = []
        for i in range(n_frames):
            frame = waveform_i16_bytes[i * 2 * self.frame_samples:(i + 1) * 2 * self.frame_samples]
            out.append(self.vad.is_speech(frame, SAMPLE_RATE))
        return out
