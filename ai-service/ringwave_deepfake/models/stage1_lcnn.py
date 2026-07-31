import torch
import torch.nn as nn
from ringwave_deepfake.models.mfm import ConvMFM, MFM

class Stage1LCNN(nn.Module):
    """Input: (B, 3, T, 60) LFCC+delta+delta2. Output: (B,) raw logit
    (use BCEWithLogitsLoss, not a sigmoid baked into the model)."""
    def __init__(self):
        super().__init__()
        self.block1 = ConvMFM(3, 64, 5, padding=2)                  # -> 32ch
        self.pool1 = nn.MaxPool2d(2, 2)
        self.block2 = ConvMFM(32, 64, 1)                            # -> 32ch
        self.block3 = ConvMFM(32, 96, 3, padding=1, use_bn=True)    # -> 48ch
        self.pool2 = nn.MaxPool2d(2, 2)
        self.block4 = ConvMFM(48, 96, 1, use_bn=True)               # -> 48ch
        self.block5 = ConvMFM(48, 128, 3, padding=1)                # -> 64ch
        self.pool3 = nn.MaxPool2d(2, 2)
        self.block6 = ConvMFM(64, 128, 1, use_bn=True)              # -> 64ch
        self.block7 = ConvMFM(64, 64, 3, padding=1, use_bn=True)    # -> 32ch
        self.block8 = ConvMFM(32, 64, 1, use_bn=True)               # -> 32ch
        self.block9 = ConvMFM(32, 64, 3, padding=1)                 # -> 32ch
        # Adaptive pool, not a fixed flatten -- this is what lets variable-
        # length tail windows skip zero-padding entirely.
        self.gap = nn.AdaptiveAvgPool2d((4, 4))
        self.fc1 = nn.Linear(32 * 4 * 4, 160)
        self.mfm_fc = MFM(dim=1)
        self.dropout = nn.Dropout(0.5)
        self.fc2 = nn.Linear(80, 1)

    def forward(self, x):
        x = self.pool1(self.block1(x))
        x = self.block2(x)
        x = self.pool2(self.block3(x))
        x = self.block4(x)
        x = self.pool3(self.block5(x))
        x = self.block6(x)
        x = self.block7(x)
        x = self.block8(x)
        x = self.block9(x)
        x = self.gap(x).flatten(1)
        x = self.mfm_fc(self.fc1(x))
        x = self.dropout(x)
        return self.fc2(x).squeeze(-1)
