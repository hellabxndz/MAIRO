"""Speech-to-text through the free Google Web Speech endpoint.

No API key, which makes it a useful fallback, but it needs internet and is
less accurate than the OpenAI model.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.utils.errors import VoiceError
from app.utils.logging_setup import get_logger
from app.voice.base import SpeechToText

log = get_logger("voice.stt.google")


class GoogleSpeechToText(SpeechToText):
    name = "google"

    def __init__(self, settings: Any = None) -> None:
        self.settings = settings

    def is_available(self) -> bool:
        try:
            import speech_recognition
        except ImportError:
            return False
        return speech_recognition is not None

    def transcribe(self, wav_path: Path) -> str:
        try:
            import speech_recognition as sr
        except ImportError as exc:
            raise VoiceError(
                "The SpeechRecognition package is not installed.",
                hint="Run: pip install -r requirements.txt",
            ) from exc

        recogniser = sr.Recognizer()
        try:
            with sr.AudioFile(str(wav_path)) as source:
                audio = recogniser.record(source)
            return (recogniser.recognize_google(audio) or "").strip()
        except sr.UnknownValueError as exc:
            raise VoiceError(
                "That could not be understood.", hint="Try again a little more slowly."
            ) from exc
        except sr.RequestError as exc:
            raise VoiceError(
                "The speech recognition service could not be reached.",
                hint="Check your internet connection.",
            ) from exc
        except Exception as exc:
            log.error("Google transcription failed: %s", type(exc).__name__)
            raise VoiceError("Speech could not be transcribed.", hint=str(exc)[:160]) from exc
