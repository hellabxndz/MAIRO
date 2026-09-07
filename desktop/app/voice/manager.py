"""One entry point for everything the assistant hears and says.

The manager owns provider selection, so the rest of the app calls `listen`,
`speak` and `stop_speaking` without knowing which service is behind them.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from app.utils.errors import VoiceError
from app.utils.logging_setup import get_logger
from app.voice.base import SpeechToText, TextToSpeech, VoiceOption
from app.voice.recorder import (
    Recorder,
    default_input_device,
    list_input_devices,
    microphone_available,
)
from app.voice.stt_google import GoogleSpeechToText
from app.voice.stt_openai import OpenAISpeechToText
from app.voice.tts_openai import OpenAITextToSpeech
from app.voice.tts_system import SystemTextToSpeech
from app.voice.wake_word import create_detector

log = get_logger("voice")

STT_PROVIDERS: dict[str, type] = {"openai": OpenAISpeechToText, "google": GoogleSpeechToText}
TTS_PROVIDERS: dict[str, type] = {"system": SystemTextToSpeech, "openai": OpenAITextToSpeech}


class VoiceManager:
    """Records, transcribes and speaks, according to the current settings."""

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self.recorder = Recorder()
        self._stt: SpeechToText | None = None
        self._stt_key = ""
        self._tts: TextToSpeech | None = None
        self._tts_key = ""
        self.wake_detector = create_detector(settings)

    # ---------------------------------------------------------- providers

    @property
    def stt(self) -> SpeechToText:
        key = self.settings.stt_provider
        if self._stt is None or key != self._stt_key:
            provider_class = STT_PROVIDERS.get(key, OpenAISpeechToText)
            self._stt = provider_class(self.settings)
            self._stt_key = key
        return self._stt

    @property
    def tts(self) -> TextToSpeech:
        key = self.settings.tts_provider
        if self._tts is None or key != self._tts_key:
            provider_class = TTS_PROVIDERS.get(key, SystemTextToSpeech)
            self._tts = provider_class(self.settings)
            self._tts_key = key
        return self._tts

    def refresh_providers(self) -> None:
        """Drop cached providers after the user changes settings."""
        self._stt = None
        self._tts = None
        self.wake_detector = create_detector(self.settings)

    # ------------------------------------------------------------- input

    def microphones(self) -> list[tuple[int, str]]:
        return list_input_devices()

    def default_microphone(self) -> int | None:
        return default_input_device()

    def test_microphone(self) -> tuple[bool, str]:
        return microphone_available(self.settings.input_device)

    def record(self, on_level: Callable[[float], None] | None = None) -> Path:
        return self.recorder.record(
            device=self.settings.input_device,
            max_seconds=self.settings.max_record_seconds,
            silence_seconds=self.settings.silence_seconds,
            on_level=on_level,
        )

    def stop_recording(self) -> None:
        self.recorder.stop()

    def transcribe(self, wav_path: Path) -> str:
        text = self.stt.transcribe(wav_path)
        if not text.strip():
            raise VoiceError(
                "Nothing could be made out from that recording.",
                hint="Try again a little closer to the microphone.",
            )
        return text.strip()

    def listen(self, on_level: Callable[[float], None] | None = None) -> str:
        """Record one clip and return what was said."""
        return self.transcribe(self.record(on_level=on_level))

    # ------------------------------------------------------------ output

    @property
    def speaks_aloud(self) -> bool:
        return bool(self.settings.voice_output_enabled)

    def speak(self, text: str) -> None:
        if not self.speaks_aloud:
            return
        self.tts.speak(text)

    def stop_speaking(self) -> None:
        try:
            self.tts.stop()
        except Exception as exc:
            log.debug("Stopping speech failed: %s", exc)

    def available_voices(self, provider: str | None = None) -> list[VoiceOption]:
        key = provider or self.settings.tts_provider
        provider_class = TTS_PROVIDERS.get(key, SystemTextToSpeech)
        try:
            return provider_class(self.settings).voices()
        except Exception as exc:
            log.warning("Could not list voices for %s: %s", key, exc)
            return []
