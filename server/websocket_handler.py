"""
websocket_handler.py - WebSocket connection for real-time frame streaming.

Handles the WebSocket endpoint for streaming webcam frames from the browser
to the server, running face detection + recognition on each frame,
and sending annotated results back to the client.
"""

import asyncio
import base64
import io
import numpy as np
import torch
from PIL import Image
from fastapi import WebSocket, WebSocketDisconnect

from server import session_manager
from server import embedding_generator
from server import recognition_engine

# Configuration
WS_FRAME_RATE = 5  # Target FPS for recognition processing


def _process_frame(frame_data: bytes, db_embeddings, db_names) -> dict:
    """
    Process a single frame synchronously (runs in thread pool).
    Detects faces, generates embeddings, and matches against stored data.
    """
    try:
        image = Image.open(io.BytesIO(frame_data)).convert("RGB")

        # Ensure models are loaded
        embedding_generator._load_models()

        boxes, _ = embedding_generator._mtcnn.detect(image)

        if boxes is not None:
            faces = embedding_generator._mtcnn.extract(image, boxes, save_path=None)

            if isinstance(faces, torch.Tensor):
                if faces.ndim == 3:
                    faces = faces.unsqueeze(0)

                if faces.shape[0] > 0:
                    query_embeddings = embedding_generator.generate_embeddings(faces)

                    results = recognition_engine.recognize_faces(
                        query_embeddings, db_embeddings, db_names, boxes
                    )

                    return {"faces": results}

        return {"faces": []}

    except Exception as e:
        return {"faces": [], "error": str(e)}


async def handle_recognition_websocket(websocket: WebSocket, session_id: str):
    """
    Handle a WebSocket connection for real-time face recognition.

    Protocol:
        - Client sends frames as base64-encoded JPEG/PNG images.
        - Server responds with JSON containing detected faces, labels, and confidence.

    Args:
        websocket: The FastAPI WebSocket connection.
        session_id: The session ID to use for loading stored embeddings.
    """
    await websocket.accept()

    # Validate session exists
    session_path = session_manager.get_session_path(session_id)
    if not session_path:
        await websocket.send_json({"error": "Invalid session ID"})
        await websocket.close()
        return

    # Load stored embeddings for this session (run in thread to avoid blocking)
    loop = asyncio.get_event_loop()
    db_embeddings, db_names = await loop.run_in_executor(
        None, embedding_generator.load_session_embeddings, session_path
    )

    if db_embeddings is None or len(db_embeddings) == 0:
        await websocket.send_json({"error": "No embeddings found. Please register a face first."})
        await websocket.close()
        return

    # Pre-load models in background thread so first frame isn't slow
    await loop.run_in_executor(None, embedding_generator._load_models)

    print(f"[WebSocket] Recognition session started for {session_id} "
          f"with {len(db_names)} registered face(s).")

    # Send ready signal to client
    await websocket.send_json({"status": "ready", "registered": len(db_names)})

    try:
        while True:
            # Receive frame data from client
            data = await websocket.receive_text()

            try:
                frame_data = base64.b64decode(data)

                # Run face detection + recognition in thread pool
                # to avoid blocking the async event loop
                result = await loop.run_in_executor(
                    None, _process_frame, frame_data, db_embeddings, db_names
                )

                await websocket.send_json(result)

            except Exception as e:
                print(f"[WebSocket] Frame processing error: {e}")
                await websocket.send_json({"faces": [], "error": str(e)})

    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected: {session_id}")
    except Exception as e:
        print(f"[WebSocket] Connection error: {e}")
    finally:
        print(f"[WebSocket] Session {session_id} WebSocket closed.")
