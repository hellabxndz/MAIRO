"""Persistent user settings plus environment-backed secrets.

Secrets (the OpenAI key) only ever come from the environment or the `.env`
file. Everything else lives in a JSON file the settings screen writes, so the
user's choices survive restarts.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, fields
from typing import Any

from dotenv import load_dotenv

from app.config.paths import env_file, settings_file
from app.utils.logging_setup import get_logger

log = get_logger("settings")

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TTS_MODEL = "gpt-4o-mini-tts"
DEFAULT_STT_MODEL = "whisper-1"


def load_environment() -> None:
    """Read `desktop/.env` into the process environment (never overrides real env vars)."""
    load_dotenv(dotenv_path=env_file(), override=False)


@dataclass
class Settings:
    """User-configurable options. Field names are the JSON keys."""

    # AI
    model: str = ""  # empty means "use OPENAI_MODEL from .env"
    context_messages: int = 12
    request_timeout: int = 45

    # Voice output
    voice_output_enabled: bool = True
    tts_provider: str = "system"  # "system" (offline) or "openai"
    tts_voice: str = ""  # system voice id, or an OpenAI voice name
    speech_rate: int = 180  # words per minute for the system voice
    openai_tts_speed: float = 1.0

    # Voice input
    stt_provider: str = "openai"  # "openai" or "google"
    input_device: int | None = None
    max_record_seconds: int = 20
    silence_seconds: float = 1.6

    # Wake word (optional, off by default)
    wake_word_enabled: bool = False
    wake_word: str = "hey mairo"

    # Weather (Open-Meteo, no API key needed)
    weather_enabled: bool = True
    weather_location: str = ""
    weather_units: str = "metric"  # "metric" or "imperial"

    # App behaviour
    start_with_windows: bool = False
    save_history: bool = True
    theme: str = "nebula"
    first_run_complete: bool = False

    # ---------------------------------------------------------------- loading

    @classmethod
    def load(cls) -> "Settings":
        path = settings_file()
        settings = cls()
        try:
            if path.exists():
                raw = json.loads(path.read_text(encoding="utf-8"))
                settings.apply(raw)
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("Could not read settings, using defaults: %s", exc)
        return settings

    def apply(self, values: dict[str, Any]) -> None:
        """Copy known keys from a dict, ignoring anything unrecognised."""
        valid = {f.name: f for f in fields(self)}
        for key, value in values.items():
            spec = valid.get(key)
            if spec is None:
                continue
            try:
                setattr(self, key, _coerce(spec.type, value))
            except (TypeError, ValueError):
                log.warning("Ignoring invalid value for setting %s", key)

    def save(self) -> None:
        data = asdict(self)
        path = settings_file()
        try:
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except OSError as exc:
            log.error("Could not save settings: %s", exc)

    # ------------------------------------------------------------ environment

    @property
    def api_key(self) -> str:
        return (os.environ.get("OPENAI_API_KEY") or "").strip()

    @property
    def has_api_key(self) -> bool:
        key = self.api_key
        return bool(key) and not key.lower().startswith("your-")

    @property
    def base_url(self) -> str:
        return (os.environ.get("OPENAI_BASE_URL") or "").strip()

    @property
    def active_model(self) -> str:
        return self.model.strip() or os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_MODEL

    @property
    def tts_model(self) -> str:
        return os.environ.get("OPENAI_TTS_MODEL", "").strip() or DEFAULT_TTS_MODEL

    @property
    def stt_model(self) -> str:
        return os.environ.get("OPENAI_STT_MODEL", "").strip() or DEFAULT_STT_MODEL

    @property
    def user_name(self) -> str:
        return (os.environ.get("MAIRO_USER_NAME") or "").strip()


def _coerce(type_hint: Any, value: Any) -> Any:
    """Best-effort conversion of JSON values into the dataclass field type."""
    hint = type_hint if isinstance(type_hint, str) else getattr(type_hint, "__name__", "")
    if "bool" in hint:
        return bool(value)
    if "int" in hint and "None" in hint:
        return None if value in (None, "") else int(value)
    if "float" in hint:
        return float(value)
    if "int" in hint:
        return int(value)
    return "" if value is None else str(value)
