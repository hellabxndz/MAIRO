"""Filesystem locations Mairo uses at runtime.

Everything the assistant writes (database, logs, notes, screenshots,
settings) lives in one per-user directory so the project folder stays clean
and the app keeps working when installed read-only.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_DIR_NAME = "Mairo"


def project_root() -> Path:
    """The folder holding .env: next to the executable once packaged."""
    if getattr(sys, "frozen", False):
        # PyInstaller: __file__ points inside the bundle, so the user's .env
        # lives beside the executable instead.
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def app_data_dir() -> Path:
    """Per-user writable directory for all Mairo state."""
    override = os.environ.get("MAIRO_HOME")
    if override:
        base = Path(override).expanduser()
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / APP_DIR_NAME
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "mairo"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _sub(name: str) -> Path:
    path = app_data_dir() / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def logs_dir() -> Path:
    return _sub("logs")


def notes_dir() -> Path:
    return _sub("notes")


def screenshots_dir() -> Path:
    return _sub("screenshots")


def temp_dir() -> Path:
    return _sub("tmp")


def database_file() -> Path:
    return app_data_dir() / "mairo.db"


def settings_file() -> Path:
    return app_data_dir() / "settings.json"


def env_file() -> Path:
    return project_root() / ".env"
