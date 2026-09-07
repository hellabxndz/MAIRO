"""Wake-word detection: interface now, engine later.

The MVP ships a detector that is switched off by default and never reports a
match. It exists so the rest of the app can already be written against a wake
word, and so adding Porcupine or openWakeWord later touches only this file:
implement `WakeWordDetector` and return it from `create_detector`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Callable

from app.utils.logging_setup import get_logger

log = get_logger("voice.wake")

DEFAULT_PHRASE = "hey mairo"


class WakeWordDetector(ABC):
    """Listens in the background and calls back when the phrase is heard."""

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
    """Placeholder that holds the contract without listening to anything.

    It keeps no microphone open, so enabling the setting can never record the
    user by accident before a real engine is wired in.
    """

    available = False

    def start(self, on_detected: Callable[[], None]) -> None:
        self._running = True
        self._callback = on_detected
        log.info("Wake word requested (%s) but no detection engine is installed", self.phrase)

    def stop(self) -> None:
        self._running = False

    @property
    def status_text(self) -> str:
        return "Wake word is not available in this build — use the microphone button"


def create_detector(settings: Any) -> WakeWordDetector:
    """Return the best detector available for the current install.

    To add a real one: pip install pvporcupine, write a PorcupineDetector that
    subclasses WakeWordDetector, and return it here when its key is present.
    """
    phrase = getattr(settings, "wake_word", DEFAULT_PHRASE)
    return NullWakeWordDetector(phrase)
