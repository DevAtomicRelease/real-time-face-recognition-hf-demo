"""
session_manager.py - Session creation, tracking, and cleanup logic.

Manages unique session IDs, creates per-session temp directories,
tracks active sessions, and triggers cleanup on disconnect/close.
"""

import os
import uuid
import time
import shutil
import threading
import platform

# Base directory for all session temp storage
# On Linux/Docker (HF Spaces): use /tmp/sessions (always writable)
# On Windows (local dev): use project-relative tmp/sessions
if platform.system() == "Windows":
    BASE_SESSION_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tmp", "sessions")
else:
    BASE_SESSION_DIR = "/tmp/sessions"

# Configuration
SESSION_TTL = 900  # 15 minutes of inactivity before auto-cleanup

# Active sessions tracker: { session_id: { "created_at": float, "last_active": float, "path": str } }
_active_sessions = {}
_lock = threading.Lock()
_cleanup_thread = None
_running = False


def _ensure_base_dir():
    """Ensure the base session directory exists."""
    os.makedirs(BASE_SESSION_DIR, exist_ok=True)


def create_session() -> dict:
    """
    Create a new session with a unique ID and its directory structure.
    Returns dict with session_id and path information.
    """
    _ensure_base_dir()

    session_id = str(uuid.uuid4())
    session_path = os.path.join(BASE_SESSION_DIR, session_id)

    # Create session subdirectories
    os.makedirs(os.path.join(session_path, "frames"), exist_ok=True)
    os.makedirs(os.path.join(session_path, "uploads"), exist_ok=True)

    now = time.time()
    session_info = {
        "session_id": session_id,
        "created_at": now,
        "last_active": now,
        "path": session_path,
    }

    with _lock:
        _active_sessions[session_id] = session_info

    return {"session_id": session_id, "path": session_path}


def get_session(session_id: str) -> dict | None:
    """Retrieve session info and update last_active timestamp."""
    with _lock:
        session = _active_sessions.get(session_id)
        if session:
            session["last_active"] = time.time()
            return session.copy()
    return None


def get_session_path(session_id: str) -> str | None:
    """Get the filesystem path for a session."""
    session = get_session(session_id)
    if session:
        return session["path"]
    return None


def session_exists(session_id: str) -> bool:
    """Check if a session ID is active."""
    with _lock:
        return session_id in _active_sessions


def end_session(session_id: str) -> bool:
    """
    End a session and delete all associated data.
    Returns True if the session was found and cleaned up.
    """
    with _lock:
        session = _active_sessions.pop(session_id, None)

    if session:
        _delete_session_dir(session["path"])
        return True
    return False


def _delete_session_dir(session_path: str):
    """Safely delete a session directory and all its contents."""
    try:
        if os.path.exists(session_path):
            shutil.rmtree(session_path)
            print(f"[SessionManager] Cleaned up session directory: {session_path}")
    except Exception as e:
        print(f"[SessionManager] Error cleaning up {session_path}: {e}")


def _cleanup_expired_sessions():
    """Remove sessions that have exceeded the TTL."""
    now = time.time()
    expired = []

    with _lock:
        for sid, info in _active_sessions.items():
            if now - info["last_active"] > SESSION_TTL:
                expired.append((sid, info["path"]))

        for sid, _ in expired:
            del _active_sessions[sid]

    for sid, path in expired:
        _delete_session_dir(path)
        print(f"[SessionManager] Expired session cleaned up: {sid}")


def _cleanup_loop():
    """Background thread that periodically checks for expired sessions."""
    global _running
    while _running:
        time.sleep(60)  # Check every 60 seconds
        _cleanup_expired_sessions()


def start_cleanup_daemon():
    """Start the background cleanup daemon thread."""
    global _cleanup_thread, _running
    if _cleanup_thread is None or not _cleanup_thread.is_alive():
        _running = True
        _cleanup_thread = threading.Thread(target=_cleanup_loop, daemon=True)
        _cleanup_thread.start()
        print("[SessionManager] Cleanup daemon started.")


def stop_cleanup_daemon():
    """Stop the background cleanup daemon."""
    global _running
    _running = False


def cleanup_all_sessions():
    """
    Purge ALL active sessions. Called on server shutdown.
    """
    with _lock:
        sessions = list(_active_sessions.items())
        _active_sessions.clear()

    for sid, info in sessions:
        _delete_session_dir(info["path"])

    # Also clean up the entire sessions directory as a safety net
    try:
        if os.path.exists(BASE_SESSION_DIR):
            shutil.rmtree(BASE_SESSION_DIR)
            print("[SessionManager] All session data purged on shutdown.")
    except Exception as e:
        print(f"[SessionManager] Error during full purge: {e}")


def list_active_sessions() -> list:
    """Return a list of active session IDs."""
    with _lock:
        return list(_active_sessions.keys())
