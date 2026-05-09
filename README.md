# Real-Time Face Recognition Web App

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11-3776ab?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.68+-009688?style=flat-square&logo=fastapi&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-2.2-ee4c2c?style=flat-square&logo=pytorch&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![HuggingFace](https://img.shields.io/badge/🤗%20Hugging%20Face-Live%20Demo-ffd21e?style=flat-square)

**Browser-based, real-time face recognition using MTCNN detection and InceptionResnetV1 (FaceNet) embeddings.**

[🚀 Live Demo](https://devatomic-face-recognition-with-embeddings.hf.space)

</div>

---

##  Features

| Feature | Description |
|---------|-------------|
| **Video Registration** | Record a 5-10 second webcam clip to register your face |
| **Image Upload** | Upload 3-10 face photos for registration |
| **Real-Time Recognition** | Live webcam stream with face bounding boxes and identity labels |
| **Ephemeral Sessions** | All data is isolated per session and auto-purged on close |
| **UI** | Glassmorphism dark-mode interface with Playfair Display + Manrope typography |
| **Docker Ready** | Single-command deployment via Docker or Hugging Face Spaces |

---

## Architecture

```
browser ──[HTTP REST]──► FastAPI ──► frame_extractor.py ──► MTCNN
   │                                                             │
   └──[WebSocket]──────► websocket_handler.py ◄── embedding_generator.py ◄── InceptionResnetV1
                                  │
                                  └──► recognition_engine.py (cosine similarity)
```

### ML Pipeline

1. **MTCNN** (`facenet-pytorch`) detects faces and extracts aligned 160×160 crops
2. **InceptionResnetV1** pretrained on VGGFace2 generates **512-dimensional embeddings**
3. Embeddings are **L2-normalized** and averaged across multiple frames/images
4. Live recognition uses **cosine similarity** with a configurable threshold (default: `0.65`)

### Session Lifecycle

- Each browser tab gets a unique **UUID session**
- Data stored in `/tmp/sessions/<uuid>/` (frames, uploads, embeddings `.pkl`)
- Background daemon purges sessions inactive for **15 minutes**
- `navigator.sendBeacon` triggers immediate cleanup on tab close

---

## Project Structure

```
face-recognition-web/
├── server/
│   ├── app.py                 # FastAPI app, routes, lifecycle
│   ├── websocket_handler.py   # Real-time frame streaming via WebSocket
│   ├── embedding_generator.py # MTCNN + InceptionResnetV1 inference
│   ├── recognition_engine.py  # Cosine similarity matching
│   ├── frame_extractor.py     # Extract frames from WebM video blobs
│   ├── session_manager.py     # UUID sessions + TTL cleanup daemon
│   ├── cleanup.py             # atexit handlers, model memory release
│   └── models/                # Place inception_resnet_v1_vggface2.pth here
├── client/
│   ├── index.html             # Main UI (Atomic Sakura design system)
│   ├── styles.css             # Glassmorphism CSS design tokens
│   ├── app.js                 # Core UI orchestration
│   ├── recorder.js            # MediaRecorder webcam capture
│   ├── uploader.js            # Drag-and-drop image upload
│   ├── recognition.js         # WebSocket client, frame capture loop
│   └── canvas.js              # Face bounding box + label overlay
├── Dockerfile                 # HF Spaces / Docker deployment
├── requirements.txt           # Local development dependencies
└── requirements-hf.txt        # HF Spaces (CPU-only torch separately)
```

---

## Local Development

### Prerequisites

- Python 3.11+
- NVIDIA GPU recommended — CPU also works

### Clone the repository

```bash
git clone https://github.com/DevAtomicRelease/real-time-face-recognition-hf-demo.git
cd real-time-face-recognition-hf-demo
```

### Create a virtual environment (Recommended)

```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

**With GPU (CUDA 12.1):**
```bash
pip install torch==2.2.2+cu121 torchvision==0.17.2+cu121 --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

**CPU only:**
```bash
pip install -r requirements.txt
```

### 2. Model Weights (Optional)

The app auto-downloads InceptionResnetV1 VGGFace2 weights on first run.  
To use a local `.pth` file, place it at:
```
server/models/inception_resnet_v1_vggface2.pth
```

### 3. Run

```bash
uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000** in your browser.

---

## Docker

```bash
docker build -t face-recognition-web .
docker run -p 7860:7860 face-recognition-web
```

Open **http://localhost:7860**

---

## Deploy to Hugging Face Spaces

This repo is configured for one-command HF Spaces deployment:

```bash
git remote add space [https://huggingface.co/spaces/<your-username>/<your-space>](https://huggingface.co/spaces/devatomic/Face_recognition_with_Embeddings)
git push space main
```

Note: The Dockerfile is optimized for CPU-only inference to stay within Hugging Face's free tier constraints.
---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11, FastAPI, Uvicorn |
| **ML** | PyTorch 2.2, facenet-pytorch (MTCNN + InceptionResnetV1) |
| **Video** | OpenCV, browser MediaRecorder API |
| **Frontend** | Vanilla JS, HTML5 Canvas, WebSockets |
| **Design** |  Glassmorphism, Playfair Display, Manrope |
| **Deployment** | Docker, Hugging Face Spaces (free tier) |

---

## Configuration

| Parameter | Default | Location |
|-----------|---------|----------|
| Cosine similarity threshold | `0.65` | `recognition_engine.py` |
| Session TTL | `900s` (15 min) | `session_manager.py` |
| WebSocket FPS | `5` | `recognition.js` |
| Min face size | `40px` | `embedding_generator.py` |

---

### Author
DevAtomic
