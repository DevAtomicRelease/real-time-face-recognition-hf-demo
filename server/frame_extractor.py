"""
frame_extractor.py - Extracts frames from uploaded video blobs.

Receives a video file, extracts N frames at even intervals using OpenCV,
and saves them as images in the session's frames/ directory.
"""

import os
import cv2
import tempfile
import numpy as np

# Configuration
MIN_FRAMES = 10
MAX_FRAMES = 30
FRAME_INTERVAL = 0.3  # seconds between extracted frames


def extract_frames_from_video(video_bytes: bytes, session_path: str) -> list[str]:
    """
    Extract frames from a video blob at even intervals.

    Args:
        video_bytes: Raw bytes of the uploaded video file.
        session_path: Path to the session directory.

    Returns:
        List of file paths to the extracted frame images.
    """
    frames_dir = os.path.join(session_path, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    # Write video bytes to a temporary file for OpenCV to read
    temp_video_path = os.path.join(session_path, "temp_video.webm")
    try:
        with open(temp_video_path, "wb") as f:
            f.write(video_bytes)

        cap = cv2.VideoCapture(temp_video_path)
        if not cap.isOpened():
            print("[FrameExtractor] Failed to open video file.")
            return []

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 30.0  # Default fallback for browser-recorded WebM

        # Calculate frame skip interval based on desired extraction rate
        # Extract approximately 1 frame every FRAME_INTERVAL seconds
        skip_interval = max(1, int(fps * FRAME_INTERVAL))

        # Read frames sequentially (browser WebM doesn't support seeking)
        all_frames = []
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Only save every Nth frame
            if frame_count % skip_interval == 0:
                frame_path = os.path.join(frames_dir, f"frame_{len(all_frames):04d}.jpg")
                cv2.imwrite(frame_path, frame)
                all_frames.append(frame_path)

                # Stop once we hit the maximum
                if len(all_frames) >= MAX_FRAMES:
                    break

            frame_count += 1

        cap.release()

        print(f"[FrameExtractor] Extracted {len(all_frames)} frames from video "
              f"(total read: {frame_count}, fps: {fps:.1f}, skip: every {skip_interval})")

        return all_frames

    finally:
        # Clean up temp video file
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)


def extract_frames_from_images(image_paths: list[str]) -> list[str]:
    """
    Validate and return image paths (for the upload path).
    Images are already saved; this just confirms they're valid.

    Args:
        image_paths: List of paths to uploaded images.

    Returns:
        List of valid image file paths.
    """
    valid_paths = []
    for path in image_paths:
        if os.path.exists(path):
            # Quick validation: try to read the image
            img = cv2.imread(path)
            if img is not None:
                valid_paths.append(path)
            else:
                print(f"[FrameExtractor] Invalid image file skipped: {path}")
        else:
            print(f"[FrameExtractor] File not found: {path}")

    return valid_paths
