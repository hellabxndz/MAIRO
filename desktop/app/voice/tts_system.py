"""Offline text-to-speech using the voices installed on the computer.

On Windows this is SAPI5, so it works with no API key, no internet and no
per-word cost. A fresh engine is built per utterance because pyttsx3's event
loop does not survive being reused across threads.
"""

from __future__ import annotations

import threading
from typing import Any

from app.utils.errors import VoiceError
from app.utils.logging_setup import get_logger
from app.voice.base import TextToSpeech, VoiceOption

log = get_logger("voice.tts.system")


class SystemTextToSpeech(TextToSpeech):
    name = "system"

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self._engine = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------ engine

    @staticmethod
    def _new_engine():
        try:
            import pyttsx3
        except ImportError as exc:
            raise VoiceError(
                "The pyttsx3 package is not installed.",
                hint="Run: pip install -r requirements.txt",
            ) from exc
        try:
            return pyttsx3.init()
        except Exception as exc:
            raise VoiceError(
                "No system speech voice could be started.",
                hint="On Windows, add a voice under Settings › Time & language › Speech.",
            ) from exc

    def is_available(self) -> bool:
        try:
            engine = self._new_engine()
            engine.stop()
            return True
        except VoiceError:
            return False

    def voices(self) -> list[VoiceOption]:
        try:
            engine = self._new_engine()
        except VoiceError:
            return []
        options: list[VoiceOption] = []
        try:
            for voice in engine.getProperty("voices"):
                label = getattr(voice, "name", None) or getattr(voice, "id", "Voice")
                options.append(VoiceOption(id=str(voice.id), label=str(label)))
        except Exception as exc:
            log.warning("Could not list system voices: %s", exc)
        finally:
            try:
                engine.stop()
            except Exception:
                pass
        return options

    # ------------------------------------------------------------ speaking

    def speak(self, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        with self._lock:
            engine = self._new_engine()
            self._engine = engine
            try:
                engine.setProperty("rate", int(self.settings.speech_rate))
                if self.settings.tts_voice:
                    engine.setProperty("voice", self.settings.tts_voice)
                engine.say(text)
                engine.runAndWait()
            except Exception as exc:
                log.warning("Speech playback failed: %s", exc)
                raise VoiceError("Mairo could not speak that aloud.", hint=str(exc)[:160]) from exc
            finally:
                try:
                    engine.stop()
                except Exception:
                    pass
                self._engine = None

    def stop(self) -> None:
        engine = self._engine
        if engine is not None:
            try:
                engine.stop()
            except Exception:
                pass
