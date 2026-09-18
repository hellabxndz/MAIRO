"""Text-to-speech through OpenAI's speech endpoint.

Higher quality than the system voices and costs a little per request. Audio
comes back as WAV and is played through the default output device.
"""

from __future__ import annotations

import io
import threading
from typing import Any

from app.utils.errors import ConfigurationError, VoiceError
from app.utils.logging_setup import get_logger
from app.voice.base import TextToSpeech, VoiceOption

log = get_logger("voice.tts.openai")

OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]
DEFAULT_VOICE = "sage"
MAX_CHARS = 4000


class OpenAITextToSpeech(TextToSpeech):
    name = "openai"

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self._stop = threading.Event()

    def is_available(self) -> bool:
        return self.settings.has_api_key

    def voices(self) -> list[VoiceOption]:
        return [VoiceOption(id=name, label=name.capitalize()) for name in OPENAI_VOICES]

    def stop(self) -> None:
        self._stop.set()
        try:
            import sounddevice as sd

            sd.stop()
        except Exception:
            pass

    def speak(self, text: str) -> None:
        text = (text or "").strip()[:MAX_CHARS]
        if not text:
            return
        if not self.settings.has_api_key:
            raise ConfigurationError(
                "The OpenAI voice needs an API key.",
                hint="Add OPENAI_API_KEY to desktop/.env, or choose the system voice in Settings.",
            )
        self._stop.clear()

        try:
            from openai import OpenAI
        except ImportError as exc:
            raise ConfigurationError("The openai package is not installed.") from exc

        voice = self.settings.tts_voice if self.settings.tts_voice in OPENAI_VOICES else DEFAULT_VOICE
        kwargs: dict[str, Any] = {
            "api_key": self.settings.api_key,
            "timeout": self.settings.request_timeout,
        }
        if self.settings.base_url:
            kwargs["base_url"] = self.settings.base_url

        try:
            client = OpenAI(**kwargs)
            response = client.audio.speech.create(
                model=self.settings.tts_model,
                voice=voice,
                input=text,
                response_format="wav",
                speed=max(0.25, min(4.0, float(self.settings.openai_tts_speed))),
            )
            audio_bytes = response.read() if hasattr(response, "read") else response.content
        except Exception as exc:
            log.error("OpenAI speech request failed (%s)", type(exc).__name__)
            raise VoiceError(
                "Mairo could not generate speech.",
                hint="Check your connection, or switch to the system voice in Settings.",
            ) from exc

        self._play(audio_bytes)

    def _play(self, audio_bytes: bytes) -> None:
        try:
            import sounddevice as sd
            import soundfile as sf
        except (ImportError, OSError) as exc:
            raise VoiceError(
                "Audio playback is not available on this computer.",
                hint="Choose the system voice in Settings.",
            ) from exc
        try:
            data, rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")
            if self._stop.is_set():
                return
            sd.play(data, rate)
            sd.wait()
        except Exception as exc:
            log.warning("Playback failed: %s", exc)
            raise VoiceError("The generated speech could not be played.", hint=str(exc)[:160]) from exc
