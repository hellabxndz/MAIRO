"""Exception types that carry a message safe to show in the UI."""

from __future__ import annotations


class MairoError(Exception):
    """Base class. `str(exc)` is always safe to display to the user."""

    def __init__(self, message: str, *, hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint

    def display(self) -> str:
        return f"{self.message} {self.hint}".strip()


class ConfigurationError(MairoError):
    """Missing API key, unreadable settings, bad environment."""


class AIError(MairoError):
    """The language model could not be reached or refused the request."""


class VoiceError(MairoError):
    """Microphone, speech-to-text or text-to-speech failure."""


class ToolError(MairoError):
    """A computer action could not be completed."""
