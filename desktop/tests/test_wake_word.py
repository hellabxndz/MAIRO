"""Wake-word tests.

The safety property matters most here: switching the setting on must never
start recording unless a real engine is present and working.
"""

from __future__ import annotations

import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-wake-tests-"))

try:
    from PySide6.QtWidgets import QApplication
except ImportError:  # pragma: no cover
    QApplication = None

from app.config.settings import Settings  # noqa: E402
from app.voice import wake_word  # noqa: E402
from app.voice.wake_word import (  # noqa: E402
    NullWakeWordDetector,
    PorcupineWakeWordDetector,
    WakeWordDetector,
    create_detector,
)


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings()
        self.settings.wake_word = "hey mairo"
        self._saved = dict(os.environ)

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._saved)

    def test_without_the_engine_the_placeholder_is_used(self):
        original = wake_word.porcupine_available
        wake_word.porcupine_available = lambda: False
        try:
            detector = create_detector(self.settings)
        finally:
            wake_word.porcupine_available = original
        self.assertIsInstance(detector, NullWakeWordDetector)
        self.assertFalse(detector.available)

    def test_the_engine_without_a_key_still_falls_back(self):
        original = wake_word.porcupine_available
        wake_word.porcupine_available = lambda: True
        os.environ.pop("PICOVOICE_ACCESS_KEY", None)
        try:
            detector = create_detector(self.settings)
        finally:
            wake_word.porcupine_available = original
        self.assertIsInstance(detector, NullWakeWordDetector)

    def test_the_engine_with_a_key_is_chosen(self):
        original = wake_word.porcupine_available
        wake_word.porcupine_available = lambda: True
        os.environ["PICOVOICE_ACCESS_KEY"] = "test-key"
        os.environ["PICOVOICE_KEYWORD_FILE"] = "/tmp/hey-mairo.ppn"
        try:
            detector = create_detector(self.settings)
        finally:
            wake_word.porcupine_available = original
        self.assertIsInstance(detector, PorcupineWakeWordDetector)
        self.assertTrue(detector.available)
        self.assertEqual(detector.access_key, "test-key")
        self.assertEqual(detector.keyword_path, "/tmp/hey-mairo.ppn")
        self.assertEqual(detector.phrase, "hey mairo")

    def test_the_phrase_falls_back_to_a_default(self):
        self.settings.wake_word = "   "
        detector = create_detector(self.settings)
        self.assertEqual(detector.phrase, "hey mairo")


class PlaceholderTests(unittest.TestCase):
    def test_starting_it_never_listens(self):
        detector = NullWakeWordDetector("hey mairo")
        heard: list[int] = []
        before = threading.active_count()
        detector.start(lambda: heard.append(1))
        self.assertFalse(detector.is_running)
        self.assertEqual(heard, [])
        # No listener thread, so nothing can be recording.
        self.assertEqual(threading.active_count(), before)
        detector.stop()

    def test_it_explains_itself(self):
        text = NullWakeWordDetector().status_text
        self.assertIn("pvporcupine", text)
        self.assertIn("microphone button", text)

    def test_it_honours_the_interface(self):
        self.assertTrue(issubclass(NullWakeWordDetector, WakeWordDetector))
        self.assertTrue(issubclass(PorcupineWakeWordDetector, WakeWordDetector))


class PorcupineTests(unittest.TestCase):
    """Drives the listener loop with a stand-in engine and audio stream."""

    def test_a_detection_fires_the_callback_once(self):
        detector = PorcupineWakeWordDetector("computer", access_key="k")
        frames = [-1, -1, 0]  # the third frame is a match

        class FakeEngine:
            sample_rate = 16_000
            frame_length = 512

            def __init__(self):
                self.deleted = False

            def process(self, frame):
                return frames.pop(0) if frames else -1

            def delete(self):
                self.deleted = True

        engine = FakeEngine()
        stream = _FakeStream(engine.frame_length)
        detector._build_engine = lambda: engine
        heard: list[int] = []

        with _fake_sounddevice(stream):
            detector.start(lambda: heard.append(1))
            detector._thread.join(timeout=5)

        self.assertEqual(heard, [1])
        self.assertFalse(detector.is_running)
        self.assertTrue(engine.deleted, "the engine must be released")
        self.assertTrue(stream.closed, "the microphone must be released")

    def test_stopping_releases_the_microphone(self):
        detector = PorcupineWakeWordDetector("computer", access_key="k")

        class QuietEngine:
            sample_rate = 16_000
            frame_length = 512

            def __init__(self):
                self.deleted = False

            def process(self, frame):
                return -1  # never matches

            def delete(self):
                self.deleted = True

        engine = QuietEngine()
        stream = _FakeStream(engine.frame_length)
        detector._build_engine = lambda: engine

        with _fake_sounddevice(stream):
            detector.start(lambda: None)
            self.assertTrue(detector.is_running)
            detector.stop()

        self.assertFalse(detector.is_running)
        self.assertTrue(stream.closed)
        self.assertTrue(engine.deleted)

    def test_a_broken_engine_does_not_raise(self):
        detector = PorcupineWakeWordDetector("computer", access_key="k")

        def explode():
            raise RuntimeError("invalid access key")

        detector._build_engine = explode
        with _fake_sounddevice(_FakeStream(512)):
            detector.start(lambda: None)
            detector._thread.join(timeout=5)
        self.assertFalse(detector.is_running)

    def test_an_untrained_phrase_uses_a_built_in_keyword(self):
        detector = PorcupineWakeWordDetector("hey mairo", access_key="k")
        captured: dict = {}

        class FakeModule:
            @staticmethod
            def create(access_key=None, keywords=None, keyword_paths=None):
                captured["keywords"] = keywords
                captured["paths"] = keyword_paths
                return object()

        sys.modules["pvporcupine"] = FakeModule
        try:
            detector._build_engine()
        finally:
            del sys.modules["pvporcupine"]
        self.assertEqual(captured["keywords"], ["computer"])
        self.assertIsNone(captured["paths"])

    def test_a_keyword_file_is_used_when_given(self):
        detector = PorcupineWakeWordDetector("hey mairo", access_key="k", keyword_path="/x.ppn")
        captured: dict = {}

        class FakeModule:
            @staticmethod
            def create(access_key=None, keywords=None, keyword_paths=None):
                captured["paths"] = keyword_paths
                return object()

        sys.modules["pvporcupine"] = FakeModule
        try:
            detector._build_engine()
        finally:
            del sys.modules["pvporcupine"]
        self.assertEqual(captured["paths"], ["/x.ppn"])


class _FakeStream:
    """Stands in for a sounddevice RawInputStream."""

    def __init__(self, frame_length: int):
        self.frame_length = frame_length
        self.closed = False
        self.stopped = False

    def start(self):
        pass

    def read(self, frames):
        return b"\x00\x00" * frames, False

    def stop(self):
        self.stopped = True

    def close(self):
        self.closed = True


class _fake_sounddevice:
    """Installs a stand-in sounddevice module for the duration of a block."""

    def __init__(self, stream):
        self.stream = stream

    def __enter__(self):
        outer = self

        class FakeModule:
            @staticmethod
            def RawInputStream(**kwargs):  # noqa: N802 - mirrors the real name
                return outer.stream

        self._previous = sys.modules.get("sounddevice")
        sys.modules["sounddevice"] = FakeModule
        return self

    def __exit__(self, *exc_info):
        if self._previous is not None:
            sys.modules["sounddevice"] = self._previous
        else:
            sys.modules.pop("sounddevice", None)
        return False


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class WindowWakeWordTests(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def _window(self, wake_enabled: bool, detector=None):
        from app.ai.brain import Brain
        from app.ai.conversation import ConversationStore
        from app.database.db import Database
        from app.memory.memory_store import MemoryStore
        from app.tools.base import ToolContext
        from app.tools.registry import build_default_registry
        from app.ui.main_window import MainWindow
        from tests.test_ui_flow import FakeVoice, ScriptedProvider

        database = Database(Path(os.environ["MAIRO_HOME"]) / f"wake-{os.urandom(4).hex()}.db")
        settings = Settings()
        settings.first_run_complete = True
        settings.wake_word_enabled = wake_enabled
        memory = MemoryStore(database)
        conversations = ConversationStore(database, enabled=True)
        conversations.start_new()
        tools = build_default_registry(ToolContext(settings=settings, memory=memory, db=database))
        brain = Brain(ScriptedProvider([]), tools, memory, conversations, settings)
        voice = FakeVoice()
        if detector is not None:
            voice.wake_detector = detector
        window = MainWindow(settings, brain, voice, conversations, memory)
        window.database = database
        return window

    def test_switched_off_nothing_starts(self):
        detector = _RecordingDetector()
        window = self._window(False, detector)
        window._start_wake_word()
        self.assertFalse(detector.started)

    def test_switched_on_with_an_engine_it_listens(self):
        detector = _RecordingDetector()
        window = self._window(True, detector)
        window._start_wake_word()
        self.assertTrue(detector.started)

    def test_switched_on_without_an_engine_it_says_so_once(self):
        window = self._window(True, NullWakeWordDetector())
        window._start_wake_word()
        window._start_wake_word()
        notices = [
            bubble.body.text()
            for bubble in window.transcript._bubbles
            if "pvporcupine" in bubble.body.text()
        ]
        self.assertEqual(len(notices), 1, "the explanation should not repeat")

    def test_hearing_the_phrase_starts_a_turn(self):
        window = self._window(True, _RecordingDetector())
        started: list[str] = []
        window.toggle_listening = lambda: started.append("listening")
        window._on_wake_word()
        self.assertEqual(started, ["listening"])

    def test_the_panel_states_whether_it_is_listening(self):
        window = self._window(True, _RecordingDetector())
        window.refresh_assistant_panel()
        self.assertIn("is on", window.wake_label.text())

        off = self._window(False, _RecordingDetector())
        off.refresh_assistant_panel()
        self.assertIn("off", off.wake_label.text())

    def test_the_panel_admits_a_missing_engine(self):
        window = self._window(True, NullWakeWordDetector())
        window.refresh_assistant_panel()
        self.assertIn("no engine", window.wake_label.text())


class _RecordingDetector(WakeWordDetector):
    """A detector that records being started, without touching audio."""

    available = True

    def __init__(self):
        super().__init__("hey mairo")
        self.started = False

    def start(self, on_detected):
        self.started = True
        self._running = True

    def stop(self):
        self._running = False


if __name__ == "__main__":
    unittest.main(verbosity=2)
