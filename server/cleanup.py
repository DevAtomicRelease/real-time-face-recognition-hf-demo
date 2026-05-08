"""
cleanup.py - Deletion of session directories on disconnect.

Provides atexit handlers and utility functions for ensuring
all session data is purged when appropriate.
"""

import atexit
from server import session_manager
from server.embedding_generator import unload_models


def _shutdown_handler():
    """Handler called on normal Python interpreter exit."""
    print("[Cleanup] Server shutting down — purging all session data...")
    session_manager.stop_cleanup_daemon()
    session_manager.cleanup_all_sessions()
    unload_models()


def register_cleanup_handlers():
    """
    Register atexit handler for cleanup on shutdown.
    Uvicorn handles SIGINT/SIGTERM natively — we only need atexit.
    """
    atexit.register(_shutdown_handler)
    print("[Cleanup] Cleanup handlers registered.")


def cleanup_session(session_id: str) -> bool:
    """
    Clean up a specific session. Called on WebSocket disconnect,
    browser close, or manual session end.

    Args:
        session_id: The session ID to clean up.

    Returns:
        True if the session was found and cleaned up, False otherwise.
    """
    result = session_manager.end_session(session_id)
    if result:
        print(f"[Cleanup] Session {session_id} cleaned up successfully.")
    else:
        print(f"[Cleanup] Session {session_id} not found (may already be cleaned up).")
    return result
