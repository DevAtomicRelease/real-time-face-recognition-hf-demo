# ── Hugging Face Spaces Dockerfile ────────────────────────────────
# Free tier: 2 vCPU, 16GB RAM, CPU-only
# SDK: Docker | Port: 7860

FROM python:3.11-slim

# Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install CPU-only PyTorch first (smaller image, ~200MB vs ~2.5GB CUDA)
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    torchvision==0.17.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Copy and install remaining requirements
COPY requirements-hf.txt .
RUN pip install --no-cache-dir -r requirements-hf.txt

# Copy application code
COPY server/ ./server/
COPY client/ ./client/

# Create tmp directory for sessions (writable at runtime)
RUN mkdir -p /tmp/sessions

# HF Spaces runs as user with uid 1000
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app /tmp/sessions
USER appuser

# Expose HF Spaces default port
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/')" || exit 1

# Start the FastAPI server on port 7860
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "7860"]
