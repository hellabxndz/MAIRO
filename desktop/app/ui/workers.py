"""Background threads.

Everything slow — recording, transcription, the model call, speaking — runs
here so the orb keeps animating and the window never freezes. Communication
back to the interface is by signal only.
"""

from __future__ import annotations

import threading
from typing import Any

from PySide6.QtCore import QObject, QThread, Signal

from app.utils.errors import MairoError
from app.utils.logging_setup import get_logger

log = get_logger("ui.workers")


class ConfirmationRequest:
    """Carries a confirmation question to the UI and the answer back.

    The worker thread blocks on `event` while the main thread shows a dialog.
    """

    def __init__(self, tool_name: str, question: str) -> None:
        self.tool_name = tool_name
        self.question = question
        self.event = threading.Event()
        self.allowed = False

    def answer(self, allowed: bool) -> None:
        self.allowed = allowed
        self.event.set()

    def wait(self, timeout: float = 120.0) -> bool:
        if not self.event.wait(timeout):
            log.warning("Confirmation for %s timed out", self.tool_name)
            return False
        return self.allowed


class AssistantWorker(QThread):
    """One full turn: optionally listen, then think, act and speak."""

    status_changed = Signal(str)
    level_changed = Signal(float)
    heard = Signal(str)
    replied = Signal(str)
    tool_ran = Signal(str, str)
    failed = Signal(str)
    finished_turn = Signal()
    confirmation_needed = Signal(object)

    def __init__(
        self,
        brain: Any,
        voice: Any,
        text: str | None = None,
        speak_reply: bool = True,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self.brain = brain
        self.voice = voice
        self.text = text
        self.speak_reply = speak_reply
        self._cancelled = False
        self._pending_confirmation: ConfirmationRequest | None = None

    def cancel(self) -> None:
        self._cancelled = True
        # A turn waiting on a confirmation dialog would otherwise stay blocked
        # until the request timed out, holding the thread open past shutdown.
        pending = self._pending_confirmation
        if pending is not None:
            pending.answer(False)
        try:
            self.voice.stop_recording()
            self.voice.stop_speaking()
        except Exception:
            pass

    # ------------------------------------------------------------------ run

    def run(self) -> None:  # noqa: D401 - Qt entry point
        try:
            user_text = self.text
            if user_text is None:
                self.status_changed.emit("listening")
                user_text = self.voice.listen(on_level=self.level_changed.emit)
                if self._cancelled:
                    return
                self.heard.emit(user_text)

            if not (user_text or "").strip():
                return

            self.status_changed.emit("thinking")
            reply = self.brain.respond(
                user_text,
                on_status=self.status_changed.emit,
                on_confirm=self._ask_confirmation,
                on_tool_event=self.tool_ran.emit,
            )
            if self._cancelled:
                return
            self.replied.emit(reply)

            if self.speak_reply and reply and getattr(self.voice, "speaks_aloud", True):
                self.status_changed.emit("speaking")
                try:
                    self.voice.speak(reply)
                except MairoError as exc:
                    self.failed.emit(exc.display())
        except MairoError as exc:
            self.failed.emit(exc.display())
        except Exception as exc:  # last line of defence: never kill the app
            log.exception("Unexpected failure during a turn")
            self.failed.emit(f"Something went wrong: {exc}")
        finally:
            self.level_changed.emit(0.0)
            self.status_changed.emit("ready")
            self.finished_turn.emit()

    def _ask_confirmation(self, tool_name: str, question: str) -> bool:
        if self._cancelled:
            return False
        request = ConfirmationRequest(tool_name, question)
        self._pending_confirmation = request
        try:
            self.confirmation_needed.emit(request)
            return request.wait()
        finally:
            self._pending_confirmation = None


class SpeechWorker(QThread):
    """Speaks a line of text without running a whole turn (used in Settings)."""

    failed = Signal(str)

    def __init__(self, voice: Any, text: str, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.voice = voice
        self.text = text

    def run(self) -> None:  # noqa: D401 - Qt entry point
        try:
            self.voice.tts.speak(self.text)
        except MairoError as exc:
            self.failed.emit(exc.display())
        except Exception as exc:
            log.warning("Voice preview failed: %s", exc)
            self.failed.emit(str(exc))
