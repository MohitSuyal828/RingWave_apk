# ===========================================================================
# calibrate_thresholds.py — data-driven tau1/tau2 calibration.
#
# What this is for:
#   app/config.py currently ships tau1=0.12 / tau2=0.95 as a documented
#   STARTING HEURISTIC (see the comment there) — there was no labeled
#   genuine/fake audio available in this repo to calibrate against
#   (ml/datasets/ is empty). This script is the tool to replace that
#   heuristic with real numbers, the moment you have real audio to point
#   it at: either actual RingWave call recordings, or the ASVspoof2019 LA
#   dev split checkpoints/stage1/config.yaml already references
#   (data.asvspoof_root).
#
# What this is NOT:
#   This does not retrain anything and does not touch model weights. It
#   loads the exact same frozen checkpoint (checkpoints/stage1/best.pt)
#   through the exact same preprocessing path production uses
#   (Stage1Predictor.score_p_fake — resample -> VAD -> windowing -> LFCC
#   -> Stage1LCNN, byte-for-byte the same code path detection_ws.py calls
#   on every live chunk), collects the raw p_fake scores, and reports/
#   suggests thresholds from their distribution. Pure calibration.
#
# Usage:
#   python scripts/calibrate_thresholds.py \
#       --genuine-dir /path/to/labeled/genuine_wavs \
#       --fake-dir    /path/to/labeled/fake_wavs \
#       --target-fpr  0.05
#
#   Only --genuine-dir is required (that's the false-positive side this
#   task cares about); --fake-dir is optional and, if given, additionally
#   reports what a given tau2 would miss, so a tau1 change can't be
#   evaluated in isolation from its effect on fake-detection sensitivity.
#
# Output:
#   A table of candidate thresholds vs. the false-positive rate they'd
#   produce on --genuine-dir (and false-negative rate on --fake-dir, if
#   given), plus a suggested tau1 for your --target-fpr. Nothing is
#   written back to config automatically — copy the suggested values into
#   AI_SERVICE_TAU1 / AI_SERVICE_TAU2 (or .env) yourself once you've
#   looked at the table, the same way any threshold change should be a
#   reviewed decision, not a silent script side effect.
# ===========================================================================

import argparse
import sys
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import torch
import torchaudio

from app.predictor import Stage1Predictor, _resolve_checkpoint_path
from app.protocol import DecodedChunk

CHUNK_DURATION_SECONDS = 4.0  # matches frontend/src/lib/audio/AudioChunker.ts


def iter_chunks_from_wav(path: Path, chunk_seconds: float = CHUNK_DURATION_SECONDS):
    """Splits one WAV file into fixed-length chunks at the file's native
    sample rate, mirroring how AudioChunker.ts hands the browser's raw mic
    rate to the AI service (resampling to 16k happens inside
    score_p_fake, same as production — not here)."""
    waveform, sr = torchaudio.load(str(path))
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)  # downmix to mono
    waveform = waveform.squeeze(0)

    chunk_len = int(chunk_seconds * sr)
    if chunk_len <= 0:
        return

    total = waveform.shape[-1]
    for start in range(0, total, chunk_len):
        segment = waveform[start : start + chunk_len]
        # Drop a trailing partial chunk under half a chunk long — too
        # short to be representative, same spirit as production's
        # MIN_WINDOW_SAMPLES guard for very short input.
        if segment.shape[-1] < chunk_len // 2:
            continue

        samples = array("f", segment.tolist())

        yield DecodedChunk(
            header={"sampleRate": sr},
            sample_count=len(samples),
            samples=samples,
        )


def score_directory(predictor: Stage1Predictor, directory: Path) -> list[float]:
    scores: list[float] = []
    wav_files = sorted(directory.glob("*.wav"))
    if not wav_files:
        print(f"  WARNING: no .wav files found in {directory}", file=sys.stderr)
        return scores

    for i, wav_path in enumerate(wav_files, 1):
        for decoded in iter_chunks_from_wav(wav_path):
            p_fake = predictor.score_p_fake(decoded)
            if p_fake is not None:
                scores.append(p_fake)
        if i % 25 == 0 or i == len(wav_files):
            print(f"  ...scored {i}/{len(wav_files)} files", file=sys.stderr)

    return scores


def suggest_tau1(genuine_scores: list[float], target_fpr: float) -> float:
    """Smallest tau1 such that at most target_fpr of genuine_scores exceed
    it (i.e. would be misclassified as not-real under this tau1)."""
    if not genuine_scores:
        raise ValueError("No genuine scores to calibrate against")
    sorted_scores = sorted(genuine_scores)
    idx = int(round((1.0 - target_fpr) * (len(sorted_scores) - 1)))
    idx = max(0, min(idx, len(sorted_scores) - 1))
    return round(sorted_scores[idx], 3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--genuine-dir", type=Path, required=True,
        help="Directory of labeled genuine-speech .wav files",
    )
    parser.add_argument(
        "--fake-dir", type=Path, default=None,
        help="Directory of labeled fake/synthetic .wav files (optional, for tau2 context)",
    )
    parser.add_argument(
        "--target-fpr", type=float, default=0.05,
        help="Target false-positive rate on genuine speech (default: 0.05 = 5%%)",
    )
    parser.add_argument(
        "--checkpoint", type=Path, default=None,
        help="Override checkpoint path (defaults to checkpoints/stage1/best.pt, same as the service)",
    )
    args = parser.parse_args()

    checkpoint_path = args.checkpoint or _resolve_checkpoint_path()
    print(f"Loading frozen checkpoint: {checkpoint_path}", file=sys.stderr)
    # tau1/tau2 given here are throwaway — only score_p_fake() is used
    # below, never predict()'s thresholding, so these just need to satisfy
    # the constructor's tau1 < tau2 sanity check.
    predictor = Stage1Predictor(checkpoint_path, device="cpu", tau1=0.0, tau2=1.0)

    print(f"\nScoring genuine speech in {args.genuine_dir} ...", file=sys.stderr)
    genuine_scores = score_directory(predictor, args.genuine_dir)
    if not genuine_scores:
        print("No usable genuine chunks scored (all silence/too-short, or no files found) — aborting.", file=sys.stderr)
        sys.exit(1)
    print(f"Scored {len(genuine_scores)} genuine chunks.\n")

    fake_scores: list[float] = []
    if args.fake_dir:
        print(f"Scoring fake speech in {args.fake_dir} ...", file=sys.stderr)
        fake_scores = score_directory(predictor, args.fake_dir)
        print(f"Scored {len(fake_scores)} fake chunks.\n")

    print("tau1 candidate  |  genuine FPR (scored 'not real')")
    print("-" * 50)
    for tau1_candidate in [0.02, 0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25]:
        fpr = sum(1 for s in genuine_scores if s > tau1_candidate) / len(genuine_scores)
        print(f"{tau1_candidate:>14.2f}  |  {fpr:>6.1%}")

    if fake_scores:
        print("\ntau2 candidate  |  fake FNR (scored 'not fake', missed)")
        print("-" * 70)
        for tau2_candidate in [0.75, 0.80, 0.85, 0.90, 0.92, 0.95, 0.98]:
            fnr = sum(1 for s in fake_scores if s < tau2_candidate) / len(fake_scores)
            print(f"{tau2_candidate:>14.2f}  |  {fnr:>6.1%}")

    suggested_tau1 = suggest_tau1(genuine_scores, args.target_fpr)
    print(f"\nSuggested tau1 for target FPR {args.target_fpr:.1%}: {suggested_tau1}")
    print("(tau2 has no equivalent single 'right' answer without a stated fake-detection")
    print(" recall target — use the tau2 table above against your own tolerance, or, if")
    print(" only --genuine-dir was given, leave tau2 at its current config.py value.)")
    print(f"\nAI_SERVICE_TAU1={suggested_tau1}")


if __name__ == "__main__":
    main()
