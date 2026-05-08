"""
recognition_engine.py - Cosine similarity matching against stored embeddings.

Takes a query embedding from a detected face and compares it
against all stored reference embeddings using cosine similarity.
Returns the best match label and confidence score.
"""

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

# Configuration
THRESHOLD = 0.65  # Cosine similarity cutoff for positive match


def find_best_match(query_embedding: np.ndarray, db_embeddings: np.ndarray,
                    db_names: list, threshold: float = THRESHOLD) -> tuple:
    """
    Find the best matching identity for a query embedding.

    Args:
        query_embedding: 512-dim embedding vector of the query face.
        db_embeddings: Array of stored reference embeddings, shape (N, 512).
        db_names: List of names corresponding to each stored embedding.
        threshold: Minimum cosine similarity for a positive match.

    Returns:
        Tuple of (name, confidence_score). Returns ("Unknown", score) if below threshold.
    """
    if db_embeddings is None or len(db_embeddings) == 0 or len(db_names) == 0:
        return "Unknown", 0.0

    # Ensure query is 2D for cosine_similarity
    if query_embedding.ndim == 1:
        query_embedding = query_embedding.reshape(1, -1)

    sims = cosine_similarity(query_embedding, db_embeddings)[0]
    best_idx = int(np.argmax(sims))
    best_score = float(sims[best_idx])

    if best_score >= threshold:
        return str(db_names[best_idx]), best_score
    else:
        return "Unknown", best_score


def recognize_faces(face_embeddings: np.ndarray, db_embeddings: np.ndarray,
                    db_names: list, boxes: np.ndarray,
                    threshold: float = THRESHOLD) -> list[dict]:
    """
    Recognize multiple faces in a single frame.

    Args:
        face_embeddings: Array of query embeddings, shape (M, 512).
        db_embeddings: Array of stored reference embeddings, shape (N, 512).
        db_names: List of names for each stored embedding.
        boxes: Bounding box coordinates for each detected face, shape (M, 4).
        threshold: Cosine similarity threshold for positive match.

    Returns:
        List of dicts, each containing:
            - "box": [x1, y1, x2, y2] bounding box coordinates
            - "label": Recognized name or "Unknown"
            - "confidence": Similarity score as float
    """
    results = []

    for i, emb in enumerate(face_embeddings):
        name, score = find_best_match(emb, db_embeddings, db_names, threshold)

        box = boxes[i].tolist() if hasattr(boxes[i], 'tolist') else list(boxes[i])

        results.append({
            "box": [int(coord) for coord in box],
            "label": name,
            "confidence": round(score, 4),
        })

    return results
