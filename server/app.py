"""
app.py - FastAPI entry point and route definitions.

Serves the client static files and exposes REST + WebSocket endpoints
for session management, face registration (video/upload), and
real-time recognition.
"""

import os
import uuid
from pathlib import Path
from typing import List

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from server.session_manager import (
    create_session, get_session, get_session_path,
    session_exists, end_session, start_cleanup_daemon, list_active_sessions,
)
from server.frame_extractor import extract_frames_from_video
from server.embedding_generator import process_images_for_embeddings, load_session_embeddings
from server.websocket_handler import handle_recognition_websocket
from server.cleanup import register_cleanup_handlers, cleanup_session

# ── App Setup ────────────────────────────────────────────────────────
app = FastAPI(title="Face Recognition Web App", version="1.0.0")

# Resolve paths
SERVER_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SERVER_DIR.parent
CLIENT_DIR = PROJECT_DIR / "client"

# Serve static client files
app.mount("/static", StaticFiles(directory=str(CLIENT_DIR)), name="static")


# ── Lifecycle Events ─────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Initialize cleanup daemon and register shutdown handlers."""
    register_cleanup_handlers()
    start_cleanup_daemon()
    print("[App] Face Recognition Web App started.")


# ── Client Serving ───────────────────────────────────────────────────
@app.get("/")
async def serve_index():
    """Serve the main HTML page."""
    index_path = CLIENT_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Client index.html not found")
    return FileResponse(str(index_path), media_type="text/html")


# ── Session Endpoints ────────────────────────────────────────────────
@app.post("/api/session/start")
async def start_session():
    """
    Create a new session.
    Returns: { session_id: str }
    """
    session = create_session()
    return JSONResponse(content={"session_id": session["session_id"]})


@app.post("/api/session/end")
async def end_session_endpoint(session_id: str = Form(...)):
    """
    Manually end a session and trigger cleanup.
    Uses sendBeacon-compatible form data.
    """
    result = cleanup_session(session_id)
    return JSONResponse(content={"cleaned": result})


@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    """Fallback cleanup endpoint."""
    result = cleanup_session(session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return JSONResponse(content={"cleaned": True})


@app.get("/api/register/status/{session_id}")
async def get_registration_status(session_id: str):
    """
    Check embedding generation status for a session.
    Returns: { status: "processing" | "ready" | "failed" | "no_session" }
    """
    session_path = get_session_path(session_id)
    if not session_path:
        return JSONResponse(content={"status": "no_session"})

    embeddings, names = load_session_embeddings(session_path)
    if embeddings is not None and len(embeddings) > 0:
        return JSONResponse(content={
            "status": "ready",
            "embeddings_count": len(names),
            "names": names,
        })
    else:
        return JSONResponse(content={"status": "pending", "embeddings_count": 0})


# ── Registration Endpoints ───────────────────────────────────────────
@app.post("/api/register/video")
async def register_via_video(
    session_id: str = Form(...),
    name: str = Form(...),
    video: UploadFile = File(...)
):
    """
    Accept a video blob, extract frames, detect faces, generate embeddings.
    """
    session_path = get_session_path(session_id)
    if not session_path:
        raise HTTPException(status_code=404, detail="Session not found")

    # Read video bytes
    video_bytes = await video.read()
    if not video_bytes:
        raise HTTPException(status_code=400, detail="Empty video file")

    # Extract frames from video
    frame_paths = extract_frames_from_video(video_bytes, session_path)
    if not frame_paths:
        raise HTTPException(status_code=400, detail="No frames could be extracted from video")

    # Generate embeddings from extracted frames
    result = process_images_for_embeddings(frame_paths, name, session_path)

    return JSONResponse(content=result)


@app.post("/api/register/upload")
async def register_via_upload(
    session_id: str = Form(...),
    name: str = Form(...),
    images: List[UploadFile] = File(...)
):
    """
    Accept uploaded face images, detect faces, generate embeddings.
    Maximum 10 images per upload.
    """
    MAX_UPLOAD_IMAGES = 10

    session_path = get_session_path(session_id)
    if not session_path:
        raise HTTPException(status_code=404, detail="Session not found")

    if len(images) > MAX_UPLOAD_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_UPLOAD_IMAGES} images allowed per upload"
        )

    # Save uploaded images to session uploads directory
    uploads_dir = os.path.join(session_path, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    saved_paths = []
    for img_file in images:
        file_ext = os.path.splitext(img_file.filename or "image.jpg")[1] or ".jpg"
        file_name = f"{uuid.uuid4().hex}{file_ext}"
        file_path = os.path.join(uploads_dir, file_name)

        content = await img_file.read()
        if content:
            with open(file_path, "wb") as f:
                f.write(content)
            saved_paths.append(file_path)

    if not saved_paths:
        raise HTTPException(status_code=400, detail="No valid images uploaded")

    # Generate embeddings from uploaded images
    result = process_images_for_embeddings(saved_paths, name, session_path)

    return JSONResponse(content=result)


# ── WebSocket Recognition Endpoint ──────────────────────────────────
@app.websocket("/ws/recognize/{session_id}")
async def websocket_recognize(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time frame streaming and recognition."""
    await handle_recognition_websocket(websocket, session_id)
