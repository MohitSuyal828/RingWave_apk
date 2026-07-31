import torch
import torch.nn as nn

class MFM(nn.Module):
    """Max-Feature-Map (Wu et al.): split channels in half, take the
    elementwise max. Halves channel count; acts as a learned competitive
    nonlinearity in place of ReLU. Standard in every LCNN variant."""
    def __init__(self, dim=1):
        super().__init__()
        self.dim = dim

    def forward(self, x):
        a, b = torch.chunk(x, 2, dim=self.dim)
        return torch.max(a, b)

class ConvMFM(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size, padding=0, use_bn=False):
        super().__init__()
        self.conv = nn.Conv2d(in_ch, out_ch, kernel_size, padding=padding)
        self.mfm = MFM(dim=1)
        self.bn = nn.BatchNorm2d(out_ch // 2) if use_bn else nn.Identity()

    def forward(self, x):
        return self.bn(self.mfm(self.conv(x)))
