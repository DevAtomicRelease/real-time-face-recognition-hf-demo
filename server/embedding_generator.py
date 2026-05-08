"""
embedding_generator.py - MTCNN face detection + InceptionResnetV1 embedding generation.

Detects faces in images using MTCNN, crops and aligns them,
then generates 512-dimensional embeddings using InceptionResnetV1
pretrained on VGGFace2.
"""

import os
import pickle
import numpy as np
import torch
from PIL import Image
from facenet_pytorch import MTCNN, InceptionResnetV1

# Configuration
MIN_FACE_SIZE = 40  # Minimum face bounding box dimension in pixels
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "inception_resnet_v1_vggface2.pth")
DEVICE = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

# Global model instances (loaded once, shared across requests)
_mtcnn = None
_resnet = None


def _load_models():
    """Load MTCNN and InceptionResnetV1 models (lazy initialization)."""
    global _mtcnn, _resnet

    if _mtcnn is None:
        _mtcnn = MTCNN(
            image_size=160,
            margin=20,
            keep_all=True,
            post_process=True,
            min_face_size=MIN_FACE_SIZE,
            device=DEVICE,
        )
        print(f"[EmbeddingGenerator] MTCNN loaded on {DEVICE}")

    if _resnet is None:
        _resnet = InceptionResnetV1(pretrained=None)

        if os.path.exists(MODEL_PATH):
            state = torch.load(MODEL_PATH, map_location=DEVICE)
            # Remove logits layer keys if present (transfer learning artifact)
            for k in list(state.keys()):
                if k.startswith("logits."):
                    del state[k]
            _resnet.load_state_dict(state, strict=False)
            print(f"[EmbeddingGenerator] InceptionResnetV1 loaded from {MODEL_PATH}")
        else:
            # Fall back to downloading pretrained weights
            _resnet = InceptionResnetV1(pretrained="vggface2")
            print("[EmbeddingGenerator] InceptionResnetV1 loaded with pretrained VGGFace2 weights")

        _resnet.eval().to(DEVICE)


def l2_normalize(x: np.ndarray) -> np.ndarray:
    """L2-normalize embedding vectors."""
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return x / norms


def detect_faces(image_path: str) -> tuple:
    """
    Detect faces in an image using MTCNN.

    Args:
        image_path: Path to the image file.

    Returns:
        Tuple of (face_tensors, boxes) where face_tensors is a batch tensor
        of aligned 160x160 face crops, and boxes are the bounding box coordinates.
    """
    _load_models()

    img = Image.open(image_path).convert("RGB")
    boxes, _ = _mtcnn.detect(img)

    if boxes is None:
        return None, None

    faces = _mtcnn.extract(img, boxes, save_path=None)

    if isinstance(faces, torch.Tensor):
        if faces.ndim == 3:
            faces = faces.unsqueeze(0)
        if faces.shape[0] > 0:
            return faces, boxes

    return None, None


def generate_embeddings(face_tensors: torch.Tensor) -> np.ndarray:
    """
    Generate 512-dimensional embeddings from face tensors.

    Args:
        face_tensors: Batch tensor of aligned 160x160 face crops.

    Returns:
        NumPy array of L2-normalized 512-dim embeddings, shape (N, 512).
    """
    _load_models()

    with torch.no_grad():
        embeddings = _resnet(face_tensors.to(DEVICE)).cpu().numpy()

    return l2_normalize(embeddings)


def process_images_for_embeddings(image_paths: list[str], name: str, session_path: str) -> dict:
    """
    Process a list of images: detect faces, generate embeddings, average them,
    and store in a session-specific .pkl file.

    Args:
        image_paths: List of image file paths to process.
        name: Name/label to associate with this face.
        session_path: Path to the session directory.

    Returns:
        Dict with status, faces_detected count, and embeddings_count.
    """
    _load_models()

    all_embeddings = []
    total_faces = 0

    for img_path in image_paths:
        try:
            faces, boxes = detect_faces(img_path)
            if faces is not None:
                embs = generate_embeddings(faces)
                all_embeddings.append(embs)
                total_faces += len(embs)
        except Exception as e:
            print(f"[EmbeddingGenerator] Error processing {img_path}: {e}")
            continue

    if not all_embeddings:
        return {
            "status": "failed",
            "message": "No faces detected in any of the provided images.",
            "faces_detected": 0,
            "embeddings_count": 0,
        }

    # Concatenate all embeddings and compute average
    all_embs = np.vstack(all_embeddings)
    avg_embedding = l2_normalize(np.mean(all_embs, axis=0, keepdims=True))

    # Save embeddings to session pkl file
    embeddings_path = os.path.join(session_path, "embeddings.pkl")

    # Load existing embeddings if any
    existing_data = {"embeddings": [], "names": []}
    if os.path.exists(embeddings_path):
        with open(embeddings_path, "rb") as f:
            existing_data = pickle.load(f)

    # Append new embedding
    if len(existing_data["embeddings"]) == 0:
        existing_data["embeddings"] = avg_embedding
    else:
        existing_data["embeddings"] = np.vstack([existing_data["embeddings"], avg_embedding])
    existing_data["names"].append(name)

    with open(embeddings_path, "wb") as f:
        pickle.dump(existing_data, f)

    print(f"[EmbeddingGenerator] Stored embedding for '{name}': "
          f"{total_faces} faces detected, 1 averaged embedding saved.")

    return {
        "status": "ready",
        "faces_detected": total_faces,
        "embeddings_count": len(existing_data["names"]),
    }


def load_session_embeddings(session_path: str) -> tuple:
    """
    Load stored embeddings for a session.

    Returns:
        Tuple of (embeddings_array, names_list) or (None, None) if not found.
    """
    embeddings_path = os.path.join(session_path, "embeddings.pkl")

    if not os.path.exists(embeddings_path):
        return None, None

    with open(embeddings_path, "rb") as f:
        data = pickle.load(f)

    embeddings = data.get("embeddings", np.empty((0, 512)))
    names = data.get("names", [])

    if isinstance(embeddings, list):
        embeddings = np.array(embeddings)

    return embeddings, names


def unload_models():
    """Explicitly release model memory. Called on server shutdown."""
    global _mtcnn, _resnet

    _mtcnn = None
    _resnet = None

    # Force garbage collection
    import gc
    gc.collect()

    # Clear CUDA cache if available
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    print("[EmbeddingGenerator] Models unloaded, memory freed.")

