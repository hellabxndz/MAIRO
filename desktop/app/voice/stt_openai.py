"""Speech-to-text through OpenAI's transcription endpoint."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.utils.errors import ConfigurationError, VoiceError
from app.utils.logging_setup import get_logger
from app.voice.base import SpeechToText

log = get_logger("voice.stt.openai")


class OpenAISpeechToText(SpeechToText):
    name = "openai"

    def __init__(self, settings: Any) -> None:
        self.settings = settings

    def is_available(self) -> bool:
        return self.settings.has_api_key

    def transcribe(self, wav_path: Path) -> str:
        if not self.settings.has_api_key:
            raise ConfigurationError(
                "Speech recognition needs an OpenAI API key.",
                hint="Add OPENAI_API_KEY to desktop/.env, or switch to the Google recogniser "
                "in Settings.",
            )
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise ConfigurationError("The openai package is not installed.") from exc

        kwargs: dict[str, Any] = {
            "api_key": self.settings.api_key,
            "timeout": self.settings.request_timeout,
        }
        if self.settings.base_url:
            kwargs["base_url"] = self.settings.base_url

        try:
            client = OpenAI(**kwargs)
            with open(wav_path, "rb") as audio:
                result = client.audio.transcriptions.create(
                    model=self.settings.stt_model, file=audio
                )
            return (getattr(result, "text", "") or "").strip()
        except Exception as exc:
            name = type(exc).__name__
            log.error("Transcription failed (%s)", name)
            if name in ("APIConnectionError", "APITimeoutError"):
                raise VoiceError(
                    "Speech could not be transcribed because the service was unreachable.",
                    hint="Check your internet connection.",
                ) from exc
            if name == "AuthenticationError":
                raise VoiceError(
                    "The OpenAI API key was rejected while transcribing.",
                    hint="Check OPENAI_API_KEY in desktop/.env.",
                ) from exc
            raise VoiceError("Speech could not be transcribed.", hint=str(exc)[:160]) from exc
