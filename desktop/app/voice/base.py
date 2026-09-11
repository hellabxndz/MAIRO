"""Interfaces for swappable speech providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass
class VoiceOption:
    """One selectable voice, as shown in Settings."""

    id: str
    label: str


class SpeechToText(ABC):
    """Turns a recorded WAV file into text."""

    name = "stt"

    @abstractmethod
    def transcribe(self, wav_path: Path) -> str:
        """Return the recognised text, or an empty string if nothing was heard."""

    def is_available(self) -> bool:
        return True


class TextToSpeech(ABC):
    """Speaks a piece of text aloud."""

    name = "tts"

    @abstractmethod
    def speak(self, text: str) -> None:
        """Speak, blocking until finished or until `stop` is called."""

    def stop(self) -> None:
        """Interrupt playback. Safe to call when nothing is speaking."""

    def voices(self) -> list[VoiceOption]:
        return []

    def is_available(self) -> bool:
        return True
