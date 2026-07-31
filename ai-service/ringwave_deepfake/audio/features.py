import torch
import torch.nn as nn
import torchaudio

class LFCCFrontend(nn.Module):
    def __init__(self, sample_rate=16_000, n_lfcc=60, win_length=400, hop_length=160):
        super().__init__()
        self.lfcc = torchaudio.transforms.LFCC(
            sample_rate=sample_rate,
            n_filter=128,
            n_lfcc=n_lfcc,
            speckwargs={"n_fft": 512, "win_length": win_length, "hop_length": hop_length},
        )

    def forward(self, waveform: torch.Tensor) -> torch.Tensor:
        # waveform: (B, num_samples) -> (B, 3, T, n_lfcc)
        feat = self.lfcc(waveform)                          # (B, n_lfcc, T)
        d1 = torchaudio.functional.compute_deltas(feat)
        d2 = torchaudio.functional.compute_deltas(d1)
        stacked = torch.stack([feat, d1, d2], dim=1)         # (B, 3, n_lfcc, T)
        return stacked.transpose(2, 3)                        # (B, 3, T, n_lfcc)
