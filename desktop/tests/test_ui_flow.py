"""End-to-end tests that drive the real window without a display.

These cover the parts unit tests cannot reach: the worker thread, the signal
wiring, and the confirmation dialog that guards risky actions.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")  # never opens a window
os.environ["MAIRO_HOME"] = tempfile.mkdtemp(prefix="mairo-ui-tests-")

try:
    from PySide6.QtCore import QTimer
    from PySide6.QtWidgets import QApplication, QMessageBox
except ImportError:  # pragma: no cover - PySide6 missing
    QApplication = None

from app.ai.base import LLMResponse, ToolCall  # noqa: E402
from app.ai.brain import Brain  # noqa: E402
from app.ai.conversation import ConversationStore  # noqa: E402
from app.config.settings import Settings  # noqa: E402
from app.database.db import Database  # noqa: E402
from app.memory.memory_store import MemoryStore  # noqa: E402
from app.tools.base import ToolContext  # noqa: E402
from app.tools.registry import build_default_registry  # noqa: E402
from app.utils.errors import VoiceError  # noqa: E402


class ScriptedProvider:
    def __init__(self, turns):
        self.turns = list(turns)

    def is_configured(self):
        return True

    def complete(self, messages, tools=None):
        return self.turns.pop(0)


class FakeVoice:
    """Stands in for the microphone and speaker."""

    def __init__(self, heard: str = "", fail: bool = False, speaks_aloud: bool = True):
        from app.voice.wake_word import NullWakeWordDetector

        self.heard = heard
        self.fail = fail
        self.speaks_aloud = speaks_aloud
        self.spoken: list[str] = []
        self.silenced = 0
        self.armed = False
        self.wake_detector = NullWakeWordDetector()

    def listen(self, on_level=None):
        if self.fail:
            raise VoiceError("Nothing was heard.", hint="Try again.")
        if on_level:
            on_level(0.3)
        return self.heard

    def speak(self, text):
        if self.speaks_aloud:
            self.spoken.append(text)

    def arm_recording(self):
        self.armed = True

    def stop_recording(self):
        pass

    def stop_speaking(self):
        self.silenced += 1

    def test_microphone(self):
        return True, "Microphone ready"

    def microphones(self):
        return [(0, "Test microphone")]

    def refresh_providers(self):
        pass

    def available_voices(self, provider=None):
        return []


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class WindowFlowTests(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def _window(self, provider, voice):
        from app.ui.main_window import MainWindow

        database = Database(Path(os.environ["MAIRO_HOME"]) / f"ui-{os.urandom(4).hex()}.db")
        settings = Settings()
        settings.first_run_complete = True
        settings.voice_output_enabled = True
        memory = MemoryStore(database)
        conversations = ConversationStore(database, enabled=True)
        conversations.start_new()
        tools = build_default_registry(
            ToolContext(settings=settings, memory=memory, db=database)
        )
        brain = Brain(provider, tools, memory, conversations, settings)
        window = MainWindow(settings, brain, voice, conversations, memory)
        window.database = database
        return window

    def _run_until_idle(self, window, timeout_ms: int = 8000) -> None:
        """Spin the event loop until the turn finishes."""
        elapsed = 0
        while elapsed < timeout_ms:
            self.app.processEvents()
            worker = window._worker
            if worker is None or not worker.isRunning():
                self.app.processEvents()
                break
            QTimer.singleShot(0, lambda: None)
            self.app.thread().msleep(20)
            elapsed += 20
        self.app.processEvents()

    def _texts(self, window) -> list[str]:
        return [bubble.body.text() for bubble in window.transcript._bubbles]

    def test_typed_request_reaches_the_transcript_and_is_spoken(self):
        voice = FakeVoice()
        window = self._window(ScriptedProvider([LLMResponse(text="The time is 10:00.")]), voice)
        window.input.setText("what time is it?")
        window._send_typed()
        self._run_until_idle(window)

        texts = self._texts(window)
        self.assertIn("what time is it?", texts)
        self.assertIn("The time is 10:00.", texts)
        self.assertEqual(voice.spoken, ["The time is 10:00."])
        self.assertEqual(window.status.current_label(), "Ready")

    def test_silent_mode_answers_without_speaking(self):
        voice = FakeVoice(speaks_aloud=False)
        window = self._window(ScriptedProvider([LLMResponse(text="Quietly done.")]), voice)
        window.input.setText("do it quietly")
        window._send_typed()
        self._run_until_idle(window)
        self.assertIn("Quietly done.", self._texts(window))
        self.assertEqual(voice.spoken, [])

    def test_the_speech_button_turns_speaking_off_and_on(self):
        voice = FakeVoice()
        window = self._window(ScriptedProvider([]), voice)
        self.assertTrue(window.settings.voice_output_enabled)
        self.assertEqual(window.speech_button.text(), "🔊")

        window.speech_button.click()
        self.assertFalse(window.settings.voice_output_enabled)
        self.assertEqual(window.speech_button.text(), "🔇")
        self.assertIn("not spoken", self._texts(window)[-1])

        window.speech_button.click()
        self.assertTrue(window.settings.voice_output_enabled)
        self.assertEqual(window.speech_button.text(), "🔊")

    def test_silencing_stops_a_reply_already_being_read_out(self):
        voice = FakeVoice()
        window = self._window(ScriptedProvider([]), voice)
        window.speech_button.click()
        self.assertEqual(voice.silenced, 1)

    def test_the_choice_survives_a_restart(self):
        voice = FakeVoice()
        window = self._window(ScriptedProvider([]), voice)
        window.speech_button.click()
        self.assertFalse(Settings.load().voice_output_enabled)
        window.speech_button.click()
        self.assertTrue(Settings.load().voice_output_enabled)

    def test_the_recorder_is_armed_before_the_worker_starts(self):
        """Guards the race where a stop pressed during startup was swallowed."""
        voice = FakeVoice(heard="hello")
        window = self._window(ScriptedProvider([LLMResponse(text="Hello.")]), voice)
        self.assertFalse(voice.armed)
        window.toggle_listening()
        self.assertTrue(voice.armed, "the recorder must be armed on the interface thread")
        self._run_until_idle(window)

    def test_typing_does_not_arm_the_recorder(self):
        voice = FakeVoice()
        window = self._window(ScriptedProvider([LLMResponse(text="Fine.")]), voice)
        window.input.setText("hello")
        window._send_typed()
        self._run_until_idle(window)
        self.assertFalse(voice.armed)

    def test_spoken_request_is_transcribed_and_answered(self):
        voice = FakeVoice(heard="open my downloads folder")
        window = self._window(ScriptedProvider([LLMResponse(text="Opening it now.")]), voice)
        window.toggle_listening()
        self._run_until_idle(window)

        texts = self._texts(window)
        self.assertIn("open my downloads folder", texts)
        self.assertIn("Opening it now.", texts)

    def test_tool_outcome_is_shown_as_an_action(self):
        voice = FakeVoice()
        provider = ScriptedProvider([
            LLMResponse(tool_calls=[ToolCall("1", "create_note", {"text": "call Ivan tomorrow"})]),
            LLMResponse(text="Note saved."),
        ])
        window = self._window(provider, voice)
        window.input.setText("note that I should call Ivan tomorrow")
        window._send_typed()
        self._run_until_idle(window)

        joined = " ".join(self._texts(window))
        self.assertIn("create note", joined)
        self.assertIn("call Ivan tomorrow", joined)

    def test_confirmation_dialog_can_decline_a_risky_action(self):
        voice = FakeVoice()
        provider = ScriptedProvider([
            LLMResponse(tool_calls=[ToolCall("1", "lock_computer", {})]),
            LLMResponse(text="Left it unlocked."),
        ])
        window = self._window(provider, voice)

        seen: list[str] = []

        def decline_any_dialog():
            for widget in self.app.topLevelWidgets():
                if isinstance(widget, QMessageBox) and widget.isVisible():
                    seen.append(widget.text())
                    for button in widget.buttons():
                        if button.text() == "Decline":
                            button.click()
                            return

        timer = QTimer()
        timer.timeout.connect(decline_any_dialog)
        timer.start(50)

        window.input.setText("lock my computer")
        window._send_typed()
        self._run_until_idle(window)
        timer.stop()

        self.assertTrue(seen, "no confirmation dialog appeared")
        self.assertIn("lock", seen[0].lower())
        self.assertIn("Left it unlocked.", self._texts(window))

    def test_voice_failure_is_reported_not_crashed(self):
        voice = FakeVoice(fail=True)
        window = self._window(ScriptedProvider([]), voice)
        window.toggle_listening()
        self._run_until_idle(window)

        joined = " ".join(self._texts(window))
        self.assertIn("Nothing was heard.", joined)
        self.assertTrue(window.mic_button.isEnabled())

    def test_api_failure_is_reported_in_the_transcript(self):
        class BrokenProvider(ScriptedProvider):
            def complete(self, messages, tools=None):
                from app.utils.errors import AIError

                raise AIError("Mairo could not reach the OpenAI service.", hint="Check the network.")

        window = self._window(BrokenProvider([]), FakeVoice())
        window.input.setText("hello")
        window._send_typed()
        self._run_until_idle(window)

        joined = " ".join(self._texts(window))
        self.assertIn("could not reach", joined)

    def test_new_conversation_clears_the_transcript(self):
        window = self._window(ScriptedProvider([LLMResponse(text="Hello.")]), FakeVoice())
        window.input.setText("hi")
        window._send_typed()
        self._run_until_idle(window)
        self.assertTrue(self._texts(window))

        window._new_conversation()
        self.assertEqual(self._texts(window), [])
        self.assertTrue(window.empty_state.isVisible() or window.isHidden())

    def test_theme_change_restyles_every_panel(self):
        window = self._window(ScriptedProvider([]), FakeVoice())
        window.settings.theme = "ember"
        window._apply_theme()
        self.assertEqual(window.palette_colors.name, "Ember")
        self.assertEqual(window.orb.palette_colors.name, "Ember")
        self.assertEqual(window.transcript.palette_colors.name, "Ember")


if __name__ == "__main__":
    unittest.main(verbosity=2)


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class RobustnessTests(unittest.TestCase):
    """Edges that only bite after the app has been open a while."""

    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def test_the_transcript_stops_growing_for_ever(self):
        from app.ui.theme import get_palette
        from app.ui.transcript import MAX_VISIBLE_MESSAGES, TranscriptView

        view = TranscriptView(get_palette("nebula"))
        for index in range(MAX_VISIBLE_MESSAGES + 40):
            view.add_message("user", f"message {index}")
        self.assertEqual(len(view._bubbles), MAX_VISIBLE_MESSAGES)
        # The newest message is the one kept.
        self.assertIn(
            f"message {MAX_VISIBLE_MESSAGES + 39}", view._bubbles[-1].body.text()
        )

    def test_cancelling_releases_a_pending_confirmation(self):
        """Closing the window must not leave the worker blocked on a dialog."""
        from app.ui.workers import AssistantWorker, ConfirmationRequest

        worker = AssistantWorker(brain=None, voice=FakeVoice(), text="hello")
        request = ConfirmationRequest("lock_computer", "Lock the computer?")
        worker._pending_confirmation = request
        worker.cancel()
        self.assertTrue(request.event.is_set(), "the worker would still be waiting")
        self.assertFalse(request.allowed, "a cancelled turn must not authorise anything")

    def test_a_cancelled_turn_declines_further_confirmations(self):
        from app.ui.workers import AssistantWorker

        worker = AssistantWorker(brain=None, voice=FakeVoice(), text="hello")
        worker.cancel()
        self.assertFalse(worker._ask_confirmation("lock_computer", "Lock?"))
