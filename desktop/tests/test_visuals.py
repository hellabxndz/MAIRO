"""Guards for the interface's new look, and for the costs it nearly carried.

Two of these exist because of real defects found while building it: the orb's
particle maths produced NaN once the ripple pushed a point past the unit
sphere, and an animated full-window backdrop forced the entire interface to
repaint, burning a whole CPU core while sitting idle.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-visual-tests-"))

try:
    from PySide6.QtWidgets import QApplication
except ImportError:  # pragma: no cover
    QApplication = None

import numpy as np  # noqa: E402


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class OrbTests(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def _orb(self):
        from app.ui.orb import OrbWidget
        from app.ui.theme import get_palette

        orb = OrbWidget(get_palette("nebula"))
        orb.resize(420, 420)
        return orb

    def test_the_geometry_stays_finite_at_full_level(self):
        """The ripple can push a point past the unit sphere; that must not
        produce NaN, which silently corrupted every particle's brightness."""
        orb = self._orb()
        with warnings.catch_warnings():
            warnings.simplefilter("error", RuntimeWarning)
            for state in ("ready", "listening", "thinking", "speaking", "error"):
                orb.set_state(state)
                for _ in range(50):
                    orb.set_level(1.0)
                    orb._advance()
                    x, y, z, depth = orb._projected(120.0)
                    self.assertTrue(np.isfinite(x).all(), state)
                    self.assertTrue(np.isfinite(y).all(), state)
                    self.assertTrue(np.isfinite(z).all(), state)

    def test_it_paints_in_every_state(self):
        orb = self._orb()
        for state in ("ready", "listening", "thinking", "speaking", "error"):
            orb.set_state(state)
            orb.set_level(0.5)
            orb._advance()
            orb.grab()

    def test_it_slows_down_when_resting(self):
        """A resting breath should not cost a full frame rate."""
        from app.ui.orb import FRAME_MS, IDLE_FRAME_MS

        orb = self._orb()
        orb.set_state("listening")
        self.assertEqual(orb._timer.interval(), FRAME_MS)
        orb.set_state("ready")
        self.assertEqual(orb._timer.interval(), IDLE_FRAME_MS)
        self.assertGreater(IDLE_FRAME_MS, FRAME_MS)

    def test_the_halo_is_cached_between_frames(self):
        orb = self._orb()
        orb.set_state("ready")
        orb._advance()
        orb.grab()
        first = orb._halo
        orb.grab()
        self.assertIs(orb._halo, first, "the glow was rebuilt for an unchanged frame")

    def test_a_theme_change_drops_the_cached_halo(self):
        from app.ui.theme import get_palette

        orb = self._orb()
        orb.grab()
        self.assertIsNotNone(orb._halo_key)
        orb.set_palette_colors(get_palette("ember"))
        self.assertIsNone(orb._halo_key)


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class IdleCostTests(unittest.TestCase):
    """The backdrop covers the window, so anything it does, everything does."""

    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def test_the_sky_never_animates(self):
        from app.ui.starfield import Starfield
        from app.ui.theme import get_palette

        sky = Starfield(get_palette("nebula"))
        sky.resize(600, 400)
        timers = [child for child in sky.children() if child.inherits("QTimer")]
        self.assertEqual(
            timers, [], "an animated full-window backdrop repaints the entire interface"
        )

    def test_the_sky_is_drawn_once_and_reused(self):
        """Inside a real window the sky must be built once, not per frame.

        It is grabbed through a parent here on purpose: grabbing a bare,
        never-shown widget forces a polish cycle that invalidates the cache,
        which is an artefact of the test rather than of the app.
        """
        from PySide6.QtWidgets import QWidget

        from app.ui.starfield import Starfield
        from app.ui.theme import get_palette

        host = QWidget()
        host.resize(800, 600)
        sky = Starfield(get_palette("nebula"), host)
        sky.resize(800, 600)
        host.show()

        builds = []
        original = sky._build_sky
        sky._build_sky = lambda: (builds.append(1), original())[1]

        for _ in range(6):
            host.grab()
        self.assertEqual(len(builds), 1, "the sky was repainted from scratch every frame")

        sky.resize(820, 620)
        host.grab()
        self.assertEqual(len(builds), 2, "the sky should be rebuilt at a new size")

    def test_a_flat_waveform_stops_repainting(self):
        from app.ui.theme import get_palette
        from app.ui.waveform import WaveformWidget

        wave = WaveformWidget(get_palette("nebula"))
        wave.resize(400, 56)
        wave.set_active(False)
        for _ in range(80):
            wave._advance()
        settled = wave._phase
        wave._advance()
        self.assertEqual(wave._phase, settled, "an idle waveform kept animating")

    def test_speaking_drives_the_waveform_without_a_microphone(self):
        from app.ui.theme import get_palette
        from app.ui.waveform import WaveformWidget

        wave = WaveformWidget(get_palette("nebula"))
        wave.resize(400, 56)
        wave.set_active(True, synthetic=True)
        for _ in range(20):
            wave._advance()
        self.assertGreater(wave._smoothed, 0.1, "the bars stayed flat while speaking")


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class FocusModeTests(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def _window(self):
        from app.ai.brain import Brain
        from app.ai.conversation import ConversationStore
        from app.config.settings import Settings
        from app.database.db import Database
        from app.memory.memory_store import MemoryStore
        from app.tools.base import ToolContext
        from app.tools.registry import build_default_registry
        from app.ui.main_window import MainWindow
        from tests.test_ui_flow import FakeVoice, ScriptedProvider

        database = Database(Path(os.environ["MAIRO_HOME"]) / f"vis-{os.urandom(4).hex()}.db")
        settings = Settings()
        settings.first_run_complete = True
        memory = MemoryStore(database)
        conversations = ConversationStore(database, enabled=True)
        conversations.start_new()
        tools = build_default_registry(ToolContext(settings=settings, memory=memory, db=database))
        brain = Brain(ScriptedProvider([]), tools, memory, conversations, settings)
        window = MainWindow(settings, brain, FakeVoice(), conversations, memory)
        window.database = database
        return window

    def test_working_states_pull_the_hud_back(self):
        window = self._window()
        self.assertFalse(window._focused)
        for state in ("listening", "thinking", "acting", "waiting", "speaking"):
            window._on_status(state)
            self.assertTrue(window._focused, state)
            window._on_status("ready")
            self.assertFalse(window._focused, state)

    def test_the_caption_carries_the_words_while_focused(self):
        window = self._window()
        window._on_status("listening")
        window._on_heard("what is the time")
        self.assertTrue(window.focus_caption.isVisible() or window.isHidden())
        self.assertEqual(window.focus_caption.text(), "what is the time")
        window._on_status("ready")
        self.assertEqual(window.focus_caption.text(), "")

    def test_a_very_long_reply_is_trimmed_for_the_caption(self):
        window = self._window()
        window._on_status("speaking")
        window._on_replied("word " * 200)
        self.assertLessEqual(len(window.focus_caption.text()), 180)
        self.assertTrue(window.focus_caption.text().endswith("…"))

    def test_the_fade_costs_nothing_while_the_hud_is_up(self):
        """An enabled opacity effect forces an offscreen pass on every repaint."""
        window = self._window()
        for animation in window._focus_animations:
            self.assertFalse(animation.targetObject().isEnabled())

    def test_the_ticker_reports_real_readings(self):
        from app.utils.system_monitor import SystemReading

        window = self._window()
        window._on_system_reading(
            SystemReading(cpu_percent=12.5, memory_percent=44.0, disk_free_gb=91.0,
                          uptime_seconds=7200, download_kbps=10.0, upload_kbps=2.0)
        )
        joined = " ".join(window.ticker._segments)
        self.assertIn("CPU 12.5%", joined)
        self.assertIn("TOOLS ARMED", joined)
        self.assertIn("2H 0M", joined.upper())


if __name__ == "__main__":
    unittest.main(verbosity=2)
