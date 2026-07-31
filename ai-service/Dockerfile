# ── RingWave AI detection service ──────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install dependencies first, separately from application code, so Docker's
# layer cache is only invalidated by a requirements.txt change — not by
# every source file edit.
COPY requirements.txt .

# NOTE on image size: this installs torch's default PyPI wheel, which
# bundles CUDA runtime libraries even though AI_SERVICE_MODEL_DEVICE=cpu
# means none of them are used — this adds several GB to the image.
# Swapping to the CPU-only wheel index
# (--index-url https://download.pytorch.org/whl/cpu) would shrink this
# substantially, but that index wasn't reachable to verify from the
# environment this Dockerfile was authored in, and requirements.txt
# explicitly notes these exact package versions are "pinned to what the
# trained checkpoint was validated to load and run under." Shipping the
# proven-working configuration here rather than an unverified swap —
# revisit this as a real optimization once you can test the CPU wheel
# index against the actual checkpoint in your own CI.
RUN pip install --no-cache-dir -r requirements.txt

# App code, vendored model code, and the trained checkpoint.
COPY . .

RUN useradd --create-home --shell /bin/bash appuser \
  && chown -R appuser:appuser /app
USER appuser

ENV AI_SERVICE_HOST=0.0.0.0
ENV AI_SERVICE_PORT=8000

EXPOSE 8000

# Model loading (torch + checkpoint) takes real time on a cold container —
# --start-period gives it room before a slow-but-successful startup counts
# as a failure.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request,os,sys; \
port = os.environ.get('PORT') or os.environ.get('AI_SERVICE_PORT', '8000'); \
sys.exit(0) if urllib.request.urlopen('http://localhost:' + port + '/health', timeout=3).status == 200 else sys.exit(1)" || exit 1

CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
