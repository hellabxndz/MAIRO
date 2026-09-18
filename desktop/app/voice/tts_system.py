"""Offline text-to-speech using the voices installed on the computer.

Free, private and offline on every platform, with no API key. On Windows and
Linux this is pyttsx3, and a fresh engine is built per utterance because its
event loop does not survive being reused across threads. On macOS it is the
built-in `say` command, which needs no extra package at all — pyttsx3's Mac
driver would pull in the whole of pyobjc for the same result.
"""

from __future__ import annotations

import shutil
import subprocess
import threading
from typing import Any

from app.utils.errors import VoiceError
from app.utils.logging_setup import get_logger
from app.utils.platform_utils import is_macos
from app.voice.base import TextToSpeech, VoiceOption

log = get_logger("voice.tts.system")


class SystemTextToSpeech(TextToSpeech):
    name = "system"

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self._engine = None
        self._process: subprocess.Popen | None = None
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
        if is_macos():
            return shutil.which("say") is not None
        try:
            engine = self._new_engine()
            engine.stop()
            return True
        except VoiceError:
            return False

    # --------------------------------------------------------------- macOS

    def _mac_voices(self) -> list[VoiceOption]:
        """Parse `say -v ?`, whose lines read: name, locale, # sample text."""
        try:
            result = subprocess.run(
                ["say", "-v", "?"], capture_output=True, text=True, timeout=10, check=False
            )
        except (OSError, subprocess.SubprocessError) as exc:
            log.warning("Could not list macOS voices: %s", exc)
            return []
        options: list[VoiceOption] = []
        for line in result.stdout.splitlines():
            head = line.split("#", 1)[0].rstrip()
            if not head:
                continue
            parts = head.split()
            if len(parts) < 2:
                continue
            locale = parts[-1]
            name = " ".join(parts[:-1])
            if name:
                options.append(VoiceOption(id=name, label=f"{name} ({locale})"))
        return options

    def _mac_speak(self, text: str) -> None:
        command = ["say", "-r", str(int(self.settings.speech_rate))]
        if self.settings.tts_voice:
            command += ["-v", self.settings.tts_voice]
        command.append(text)
        try:
            with self._lock:
                self._process = subprocess.Popen(
                    command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            self._process.wait()
        except (OSError, subprocess.SubprocessError) as exc:
            log.warning("macOS speech failed: %s", exc)
            raise VoiceError(
                "Mairo could not speak that aloud.",
                hint="Check System Settings › Accessibility › Spoken Content.",
            ) from exc
        finally:
            self._process = None

    def voices(self) -> list[VoiceOption]:
        if is_macos():
            return self._mac_voices()
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
        if is_macos():
            self._mac_speak(text)
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
        process = self._process
        if process is not None:
            try:
                process.terminate()
            except Exception:
                pass
        engine = self._engine
        if engine is not None:
            try:
                engine.stop()
            except Exception:
                pass
