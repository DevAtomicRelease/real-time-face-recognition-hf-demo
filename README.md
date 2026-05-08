---
title: Face Recognition with Embeddings
emoji: 🔐
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Real-time face recognition using MTCNN + InceptionResnetV1
---

# Face Recognition Web App

Real-time browser-based face recognition using **MTCNN** for face detection and **InceptionResnetV1** (FaceNet) for embedding generation.

## Features
- 🎥 **Video Registration** — Record a short clip to register your face
- 📸 **Image Upload** — Upload 3-10 face images for registration
- ⚡ **Real-Time Recognition** — Live webcam face matching via WebSocket
- 🔒 **Session Isolation** — All data is ephemeral and auto-purged
- 🧠 **Cosine Similarity** — Identity matching with configurable threshold

## How It Works
1. **Register** — Enter your name and record a video or upload images
2. **Process** — MTCNN detects faces → InceptionResnetV1 generates 512-dim embeddings
3. **Recognize** — Live webcam stream matches faces against stored embeddings

## Tech Stack
- **Backend**: FastAPI + WebSocket
- **ML**: PyTorch, facenet-pytorch (MTCNN + InceptionResnetV1)
- **Frontend**: Vanilla JS, HTML5, CSS3

## Local Development
```bash
pip install -r requirements.txt
uvicorn server.app:app --host 0.0.0.0 --port 8000
```
