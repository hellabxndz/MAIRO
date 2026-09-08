"""Wake-word detection.

Mairo listens for a phrase only when the user switches it on, and only through
an engine that runs entirely on this computer. Picovoice Porcupine is the
supported engine: it is small, offline, and its free tier covers personal use.

Without that engine installed the detector is a placeholder that never opens a
microphone, so enabling the setting can never start recording by accident.

To add another engine, subclass WakeWordDetector and return it from
`create_detector`; nothing above this file needs to change.
"""

from __future__ import annotations

import os
import struct
import threading
from abc import ABC, abstractmethod
from typing import Any, Callable

from app.utils.logging_setup import get_logger

log = get_logger("voice.wake")

DEFAULT_PHRASE = "hey mairo"
# Phrases Porcupine ships with, usable without training a custom model.
BUILT_IN_KEYWORDS = {
    "alexa", "americano", "blueberry", "bumblebee", "computer", "grapefruit",
    "grasshopper", "hey google", "hey siri", "jarvis", "ok google", "picovoice",
    "porcupine", "terminator",
}


class WakeWordDetector(ABC):
    """Listens in the background and calls back when the phrase is heard."""

    available = False

    def __init__(self, phrase: str = DEFAULT_PHRASE) -> None:
        self.phrase = phrase.strip().lower() or DEFAULT_PHRASE
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    @abstractmethod
    def start(self, on_detected: Callable[[], None]) -> None:
        """Begin listening. Must return immediately."""

    @abstractmethod
    def stop(self) -> None:
        """Stop listening and release the microphone."""

    @property
    def status_text(self) -> str:
        return f"Waiting for “{self.phrase}”"


class NullWakeWordDetector(WakeWordDetector):
    """Holds the contract without listening to anything.

    It never opens the microphone, so a user who enables the setting on a
    machine with no engine installed is not silently recorded.
    """

    available = False

    def start(self, on_detected: Callable[[], None]) -> None:
        self._running = False
        log.info("Wake word requested (%s) but no detection engine is installed", self.phrase)

    def stop(self) -> None:
        self._running = False

    @property
    def status_text(self) -> str:
        return (
            "Wake word needs the pvporcupine package and a free Picovoice key — "
            "use the microphone button meanwhile"
        )


class PorcupineWakeWordDetector(WakeWordDetector):
    """Offline detection through Picovoice Porcupine.

    Audio is processed on this machine and never leaves it; the access key
    authorises the library, it does not send recordings anywhere.
    """

    available = True

    def __init__(
        self,
        phrase: str = DEFAULT_PHRASE,
        access_key: str = "",
        keyword_path: str = "",
        device: int | None = None,
    ) -> None:
        super().__init__(phrase)
        self.access_key = access_key
        self.keyword_path = keyword_path
        self.device = device
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    # ------------------------------------------------------------- engine

    def _build_engine(self):
        import pvporcupine  # imported here so the app runs without it

        if self.keyword_path:
            return pvporcupine.create(
                access_key=self.access_key, keyword_paths=[self.keyword_path]
            )
        keyword = self.phrase if self.phrase in BUILT_IN_KEYWORDS else "computer"
        if keyword != self.phrase:
            log.info(
                "“%s” needs a custom Porcupine keyword file; listening for “%s” instead",
                self.phrase,
                keyword,
            )
        return pvporcupine.create(access_key=self.access_key, keywords=[keyword])

    # ------------------------------------------------------------ control

    def start(self, on_detected: Callable[[], None]) -> None:
        if self._running:
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._listen, args=(on_detected,), name="mairo-wake-word", daemon=True
        )
        self._running = True
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._running = False
        thread = self._thread
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=2.0)
        self._thread = None

    def _listen(self, on_detected: Callable[[], None]) -> None:
        engine = None
        stream = None
        try:
            import sounddevice as sd

            engine = self._build_engine()
            stream = sd.RawInputStream(
                samplerate=engine.sample_rate,
                blocksize=engine.frame_length,
                dtype="int16",
                channels=1,
                device=self.device,
            )
            stream.start()
            log.info("Wake word listening for “%s”", self.phrase)

            while not self._stop.is_set():
                data, _overflowed = stream.read(engine.frame_length)
                frame = struct.unpack_from("h" * engine.frame_length, data)
                if engine.process(frame) >= 0:
                    log.info("Wake word heard")
                    on_detected()
                    # Let the assistant take the microphone for this turn.
                    break
        except Exception as exc:
            log.warning("Wake word listening stopped: %s", exc)
        finally:
            self._running = False
            if stream is not None:
                try:
                    stream.stop()
                    stream.close()
                except Exception:
                    pass
            if engine is not None:
                try:
                    engine.delete()
                except Exception:
                    pass


def porcupine_available() -> bool:
    from importlib.util import find_spec

    return find_spec("pvporcupine") is not None


def access_key() -> str:
    return (os.environ.get("PICOVOICE_ACCESS_KEY") or "").strip()


def create_detector(settings: Any) -> WakeWordDetector:
    """The best detector this install can offer."""
    phrase = getattr(settings, "wake_word", DEFAULT_PHRASE)
    key = access_key()
    if porcupine_available() and key:
        return PorcupineWakeWordDetector(
            phrase=phrase,
            access_key=key,
            keyword_path=(os.environ.get("PICOVOICE_KEYWORD_FILE") or "").strip(),
            device=getattr(settings, "input_device", None),
        )
    if porcupine_available() and not key:
        log.info("pvporcupine is installed but PICOVOICE_ACCESS_KEY is not set")
    return NullWakeWordDetector(phrase)
