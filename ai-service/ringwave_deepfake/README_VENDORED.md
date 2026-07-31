# Vendored from the Stage 1 training project

This `ringwave_deepfake/` directory is a partial copy from a separate
training project, containing **only** what `app/predictor.py` needs to run
inference with the trained Stage 1 checkpoint. Nothing in these files was
modified from the training project's copies.

## Copied

```
ringwave_deepfake/audio/vad.py         -- WebRTC VAD gating
ringwave_deepfake/audio/windowing.py   -- resample/normalize/sliding-window
ringwave_deepfake/audio/features.py    -- LFCC + delta + delta-delta frontend
ringwave_deepfake/models/mfm.py        -- Max-Feature-Map building block
ringwave_deepfake/models/stage1_lcnn.py -- Stage1LCNN architecture
checkpoints/stage1/best.pt              -- trained weights (see below)
checkpoints/stage1/config.yaml          -- the exact config best.pt was trained with (reference only, not read at runtime)
```

## Deliberately NOT copied

Everything training-only, and everything Stage-2-only (Stage 2 was never
trained -- there is no checkpoint for it, and instantiating it would pull
in `transformers`/`huggingface-hub` and attempt to download an XLSR
encoder for no benefit):

- `ringwave_deepfake/training/` (datasets, DataLoaders, augmentation,
  losses, train_stage1.py, checkpoint saving, TensorBoard logging)
- `ringwave_deepfake/data/` (`prepare_metadata.py`, metadata CSVs)
- `ringwave_deepfake/eval/` (EER computation, evaluation scripts)
- `ringwave_deepfake/models/stage2_encoder.py`,
  `ringwave_deepfake/models/stage2_verifier.py`,
  `ringwave_deepfake/models/aasist_backend*.py`
- `ringwave_deepfake/inference/pipeline.py` /
  `ringwave_deepfake/inference/session.py` -- these wire in Stage 2 and
  are built for whole-call offline batch processing (`CallSession`
  aggregating many windows). This service instead does real-time
  per-chunk inference (one WebSocket message in, one verdict out), which
  `app/predictor.py` implements directly using only the pieces above --
  see that file's docstring for exactly how it re-derives the same
  preprocessing steps `pipeline.py` uses, scoped to one chunk.
- All ASVspoof2019 LA data, training checkpoints other than `best.pt`
  (`last.pt`, `epoch_*.pt`), training logs, and TensorBoard runs.

## Updating the model later

To deploy a newer checkpoint, replace `checkpoints/stage1/best.pt` (same
filename, same `Stage1LCNN` architecture) and restart the service --
`app/predictor.py` loads it fresh at startup. If the model architecture
itself changes, re-copy the relevant files from `ringwave_deepfake/models/`
here too.
