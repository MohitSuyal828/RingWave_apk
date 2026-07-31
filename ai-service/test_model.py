# ===========================================================================
# test_model.py — standalone checkpoint evaluation, no server involved.
#
# Reuses the exact same `predictor` singleton app/predictor.py loads at
# import time (checkpoints/stage1/best.pt, via Stage1Predictor) — this
# script does not load its own copy of the model, does not touch model
# weights, and does not start FastAPI, WebSockets, or anything the
# frontend talks to. It exists purely to point the trained checkpoint at
# WAV files on disk and see what it says, for manual spot-checking during
# threshold work or debugging a specific recording.
#
# Usage:
#   python test_model.py test_audio/real
#   python test_model.py test_audio/fake
#   python test_model.py test_audio/real/me.wav
#
# Run this from inside ai-service/ (same convention as running the
# service itself), so app.predictor's checkpoint-path resolution finds
# checkpoints/stage1/best.pt the same way it does normally.
# ===========================================================================

import argparse
import sys
from array import array
from pathlib import Path

import soundfile as sf

from app.predictor import predictor
from app.protocol import DecodedChunk


def wav_to_decoded_chunk(path: Path) -> DecodedChunk:
    """Loads one WAV file and packages it into the exact DecodedChunk shape
    app/protocol.py's decode_chunk_frame() produces from a live WebSocket
    frame — a header carrying the sample rate plus raw float32 samples.
    Resampling to the model's 16kHz happens inside predictor.score_p_fake/
    predict, same as it does for a real chunk off the wire; this function's
    only job is the WAV-file equivalent of what detection_ws.py's decode
    step does for a binary frame.

    Uses soundfile (libsndfile) rather than torchaudio.load() — on
    PyTorch 2.12+, torchaudio.load() requires the TorchCodec/FFmpeg
    backend, which this script has zero dependency on."""
    data, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)

    # data shape is (frames, channels) with always_2d=True regardless of
    # whether the source file is mono or multi-channel; average channels
    # down to mono the same way the old torchaudio path did.
    waveform = data.mean(axis=1)

    samples = array("f", waveform.tolist())

    return DecodedChunk(
        header={"sampleRate": sample_rate},
        sample_count=len(samples),
        samples=samples,
    )


def evaluate_file(path: Path) -> dict:
    decoded = wav_to_decoded_chunk(path)

    # Two separate calls, as asked for — score_p_fake() gives the raw
    # model output, predict() gives the same thresholded verdict a real
    # call would get. Both run the identical preprocessing internally
    # (see predictor.py's score_p_fake, which predict() itself calls), so
    # there's no risk of the two numbers coming from different pipelines.
    p_fake = predictor.score_p_fake(decoded)
    verdict = predictor.predict(decoded)

    print(f"Filename: {path.name}")
    print(f"Raw p_fake score: {p_fake:.4f}" if p_fake is not None else "Raw p_fake score: N/A (no speech detected)")
    print(f"Prediction: {verdict.prediction}")
    print(f"Confidence Score: {verdict.confidence_score:.1f}")
    print("-" * 50)

    return {"path": path, "p_fake": p_fake, "prediction": verdict.prediction}


def print_summary(results: list[dict]) -> None:
    real_count = sum(1 for r in results if r["prediction"] == "likely_real")
    fake_count = sum(1 for r in results if r["prediction"] == "likely_fake")
    uncertain_count = sum(1 for r in results if r["prediction"] == "uncertain")

    scored = [r["p_fake"] for r in results if r["p_fake"] is not None]
    avg_p_fake = sum(scored) / len(scored) if scored else None

    print("=" * 50)
    print("Summary")
    print("=" * 50)
    print(f"Total files: {len(results)}")
    print(f"Real predictions: {real_count}")
    print(f"Fake predictions: {fake_count}")
    print(f"Uncertain predictions: {uncertain_count}")
    print(f"Average p_fake: {avg_p_fake:.4f}" if avg_p_fake is not None else "Average p_fake: N/A")


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate the trained Stage 1 checkpoint directly against WAV file(s)."
    )
    parser.add_argument(
        "path",
        type=Path,
        help="A single .wav file, or a directory containing .wav files",
    )
    args = parser.parse_args()

    target = args.path
    if not target.exists():
        print(f"Error: path not found: {target}", file=sys.stderr)
        sys.exit(1)

    if target.is_file():
        if target.suffix.lower() != ".wav":
            print(f"Error: {target} is not a .wav file", file=sys.stderr)
            sys.exit(1)
        evaluate_file(target)
        return

    # Directory case.
    wav_files = sorted(target.glob("*.wav"))
    if not wav_files:
        print(f"Error: no .wav files found in {target}", file=sys.stderr)
        sys.exit(1)

    results = [evaluate_file(wav_path) for wav_path in wav_files]
    print_summary(results)


if __name__ == "__main__":
    main()