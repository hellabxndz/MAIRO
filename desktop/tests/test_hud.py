"""Tests for the HUD: machine readings, gauges and the panels around them."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-hud-tests-"))

try:
    from PySide6.QtWidgets import QApplication
except ImportError:  # pragma: no cover
    QApplication = None

from app.utils import system_monitor  # noqa: E402
from app.utils.system_monitor import SystemReading  # noqa: E402


class ReadingTests(unittest.TestCase):
    def test_uptime_is_written_for_people(self):
        self.assertEqual(SystemReading(uptime_seconds=90).uptime_text, "1m")
        self.assertEqual(SystemReading(uptime_seconds=3_900).uptime_text, "1h 5m")
        self.assertEqual(SystemReading(uptime_seconds=180_000).uptime_text, "2d 2h")

    def test_a_missing_reading_shows_a_dash(self):
        self.assertEqual(SystemReading().uptime_text, "—")


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class MonitorTests(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def test_disk_is_always_reported(self):
        monitor = system_monitor.SystemMonitor()
        monitor.poll()
        monitor.stop()
        self.assertIsNotNone(monitor.latest.disk_total_gb)
        self.assertGreater(monitor.latest.disk_total_gb, 0)

    def test_readings_are_absent_rather_than_invented_without_psutil(self):
        original = system_monitor.psutil
        system_monitor.psutil = None
        try:
            monitor = system_monitor.SystemMonitor()
            monitor.poll()
            monitor.stop()
        finally:
            system_monitor.psutil = original
        self.assertIsNone(monitor.latest.cpu_percent)
        self.assertIsNone(monitor.latest.memory_percent)
        self.assertIsNone(monitor.latest.download_kbps)
        self.assertIsNotNone(monitor.latest.disk_total_gb)

    def test_network_rates_are_never_negative(self):
        monitor = system_monitor.SystemMonitor()
        monitor.poll()
        monitor.poll()
        monitor.stop()
        if monitor.latest.download_kbps is not None:
            self.assertGreaterEqual(monitor.latest.download_kbps, 0.0)
            self.assertGreaterEqual(monitor.latest.upload_kbps, 0.0)


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class GaugeTests(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def _palette(self):
        from app.ui.theme import get_palette

        return get_palette("nebula")

    def test_ring_gauge_clamps_and_formats(self):
        from app.ui.gauges import RingGauge

        gauge = RingGauge(self._palette(), "processor")
        gauge.set_reading(140)
        self.assertEqual(gauge._target, 100.0)
        self.assertEqual(gauge._centre_text, "100%")
        gauge.set_reading(-20)
        self.assertEqual(gauge._target, 0.0)

    def test_ring_gauge_shows_a_dash_when_there_is_no_reading(self):
        from app.ui.gauges import RingGauge

        gauge = RingGauge(self._palette(), "memory")
        gauge.set_reading(None)
        self.assertFalse(gauge._has_reading)
        self.assertEqual(gauge._centre_text, "—")

    def test_bar_gauge_shows_a_dash_when_there_is_no_reading(self):
        from app.ui.gauges import BarGauge

        bar = BarGauge(self._palette(), "Disk in use")
        bar.set_reading(None)
        self.assertIsNone(bar._percent)
        self.assertEqual(bar._value_text, "—")

    def test_throughput_graph_formats_rates(self):
        from app.ui.panels import ThroughputGraph

        self.assertEqual(ThroughputGraph._format(512), "512 KB/s")
        self.assertEqual(ThroughputGraph._format(2048), "2.0 MB/s")

    def test_throughput_graph_marks_itself_unavailable(self):
        from app.ui.panels import ThroughputGraph

        graph = ThroughputGraph(self._palette())
        graph.add_sample(None, None)
        self.assertFalse(graph._available)
        graph.add_sample(10.0, 2.0)
        self.assertTrue(graph._available)

    def test_widgets_paint_without_error(self):
        """A paint crash would take the whole window down, so exercise it."""
        from app.ui.gauges import BarGauge, RingGauge
        from app.ui.panels import HudPanel, MonthStrip, ThroughputGraph

        palette = self._palette()
        widgets = [
            RingGauge(palette, "processor"),
            BarGauge(palette, "Disk in use"),
            MonthStrip(palette),
            ThroughputGraph(palette),
            HudPanel(palette, "Panel"),
        ]
        for widget in widgets:
            widget.resize(260, 120)
            widget.grab()  # renders through paintEvent


@unittest.skipIf(QApplication is None, "PySide6 is not installed")
class WindowHudTests(unittest.TestCase):
    """The HUD wiring inside the real window."""

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

        database = Database(Path(os.environ["MAIRO_HOME"]) / f"hud-{os.urandom(4).hex()}.db")
        settings = Settings()
        settings.first_run_complete = True
        memory = MemoryStore(database)
        conversations = ConversationStore(database, enabled=True)
        conversations.start_new()
        tools = build_default_registry(ToolContext(settings=settings, memory=memory, db=database))
        brain = Brain(ScriptedProvider([]), tools, memory, conversations, settings)
        window = MainWindow(settings, brain, FakeVoice(), conversations, memory)
        window.database = database
        return window, memory

    def test_readings_reach_the_panels(self):
        window, _ = self._window()
        window.monitor.poll()
        self.app.processEvents()
        self.assertIn("Running for", window.uptime_label.text())
        self.assertNotEqual(window.disk_bar._value_text, "")

    def test_a_missing_reading_is_labelled_not_faked(self):
        window, _ = self._window()
        window._on_system_reading(SystemReading())
        self.assertEqual(window.cpu_gauge._centre_text, "—")
        self.assertIn("psutil", window.memory_label.text())
        self.assertIn("—", window.uptime_label.text())

    def test_assistant_panel_reports_the_real_configuration(self):
        window, memory = self._window()
        memory.remember("preferred_browser", "Chrome")
        window.settings.tts_provider = "openai"
        window.settings.stt_provider = "google"
        window.refresh_assistant_panel()
        self.assertIn(window.settings.active_model, window.model_label.text())
        self.assertIn("OpenAI voice", window.voice_label.text())
        self.assertIn("Google", window.listen_label.text())
        self.assertIn("1 thing remembered", window.memory_count_label.text())

    def test_silent_mode_is_stated_in_the_panel(self):
        window, _ = self._window()
        window.settings.voice_output_enabled = False
        window.refresh_assistant_panel()
        self.assertIn("not spoken", window.voice_label.text())

    def test_history_swaps_the_right_column_instead_of_shrinking_the_middle(self):
        window, _ = self._window()
        centre_width = window.right_stack.width()
        window._toggle_history(True)
        self.assertEqual(window.right_stack.currentIndex(), 1)
        self.assertEqual(window.right_stack.width(), centre_width)
        window._toggle_history(False)
        self.assertEqual(window.right_stack.currentIndex(), 0)

    def test_starting_a_new_conversation_returns_to_the_transcript(self):
        window, _ = self._window()
        window._toggle_history(True)
        window._new_conversation()
        self.assertEqual(window.right_stack.currentIndex(), 0)
        self.assertFalse(window.history_button.isChecked())

    def test_quick_actions_send_a_real_request(self):
        from app.ai.base import LLMResponse
        from tests.test_ui_flow import ScriptedProvider

        window, _ = self._window()
        window.brain.provider = ScriptedProvider([LLMResponse(text="It is ten o'clock.")])
        sent: list[str] = []
        window._start_turn = lambda text: sent.append(text)

        self.assertEqual(len(window.quick_buttons), 6)
        window.quick_buttons[0].click()
        self.assertEqual(sent, ["What time and date is it?"])

    def test_theme_change_restyles_the_hud_panels(self):
        window, _ = self._window()
        window.settings.theme = "ember"
        window._apply_theme()
        self.assertEqual(window.cpu_gauge.palette_colors.name, "Ember")
        self.assertEqual(window.network_graph.palette_colors.name, "Ember")
        self.assertEqual(window.month_strip.palette_colors.name, "Ember")
        self.assertEqual(window.system_panel.palette_colors.name, "Ember")


if __name__ == "__main__":
    unittest.main(verbosity=2)
