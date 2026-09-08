"""The Mairo window.

A heads-up display: machine readings down the left, the orb and controls in
the middle, the conversation and quick actions down the right. Every panel is
labelled in plain words and shows a real measurement — a reading the machine
will not give us is drawn as a dash, never invented.
"""

from __future__ import annotations

import calendar
from datetime import datetime
from typing import Any

from PySide6.QtCore import Qt, QTimer, Signal, Slot
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from app.ai.brain import Brain
from app.ai.conversation import ConversationStore
from app.config.paths import env_file, logs_dir
from app.config.settings import Settings
from app.ui import transcript as tr
from app.ui.gauges import BarGauge, RingGauge
from app.ui.history_panel import HistoryPanel
from app.ui.onboarding import OnboardingDialog
from app.ui.orb import OrbWidget
from app.ui.panels import HudPanel, MonthStrip, ThroughputGraph
from app.ui.settings_dialog import SettingsDialog
from app.ui.starfield import Starfield
from app.ui.status_indicator import StatusIndicator
from app.ui.theme import build_stylesheet, get_palette
from app.ui.transcript import EmptyState, TranscriptView
from app.ui.waveform import WaveformWidget
from app.ui.weather_panel import WeatherPanel
from app.ui.workers import AssistantWorker, ConfirmationRequest
from app.utils.errors import MairoError
from app.utils.logging_setup import get_logger
from app.utils.system_monitor import SystemMonitor, SystemReading
from app.voice.manager import VoiceManager

log = get_logger("ui.window")

WINDOW_TITLE = "Mairo"
MIC_IDLE = "🎙  Hold to speak"
MIC_ACTIVE = "■  Stop listening"
LEFT_COLUMN_WIDTH = 252
RIGHT_COLUMN_WIDTH = 336

# Label on the button, and the request it sends. Screenshot and Lock screen go
# through the same confirmation dialog as any other risky action.
QUICK_ACTIONS = [
    ("Time and date", "What time and date is it?"),
    ("Downloads", "Open my Downloads folder."),
    ("My notes", "Read my notes."),
    ("Screenshot", "Take a screenshot."),
    ("What you remember", "What do you remember about me?"),
    ("Lock screen", "Lock the computer."),
]


class MainWindow(QMainWindow):
    """Everything the user sees once Mairo is running."""

    # Emitted from the wake-word thread; delivered on the interface thread.
    wake_word_heard = Signal()

    def __init__(
        self,
        settings: Settings,
        brain: Brain,
        voice: VoiceManager,
        conversations: ConversationStore,
        memory: Any,
    ) -> None:
        super().__init__()
        self.settings = settings
        self.brain = brain
        self.voice = voice
        self.conversations = conversations
        self.memory = memory
        self.palette_colors = get_palette(settings.theme)
        self._worker: AssistantWorker | None = None
        self._listening = False
        self._wake_word_notice_shown = False

        self.setWindowTitle(WINDOW_TITLE)
        self.resize(1300, 820)
        self.setMinimumSize(1060, 680)

        self.monitor = SystemMonitor(self)
        self.monitor.updated.connect(self._on_system_reading)

        self._build_ui()
        self._apply_theme()
        self._install_shortcuts()
        self._start_clock()
        self.wake_word_heard.connect(self._on_wake_word, Qt.QueuedConnection)
        QTimer.singleShot(150, self._first_run_checks)
        QTimer.singleShot(900, self.weather_panel.refresh)
        QTimer.singleShot(1200, self._start_wake_word)

    # ----------------------------------------------------------- building

    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)

        self.starfield = Starfield(self.palette_colors, central)
        self.starfield.lower()

        self.content = QWidget(central)
        root = QVBoxLayout(self.content)
        root.setContentsMargins(20, 14, 20, 16)
        root.setSpacing(12)
        root.addWidget(self._build_top_bar())

        columns = QHBoxLayout()
        columns.setContentsMargins(0, 0, 0, 0)
        columns.setSpacing(14)
        columns.addWidget(self._build_left_column())
        columns.addWidget(self._build_centre_column(), 1)
        columns.addWidget(self._build_right_column())
        root.addLayout(columns, 1)

    def _build_top_bar(self) -> QWidget:
        bar = QWidget()
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(18)

        self.wordmark = QLabel("M A I R O")
        self.tagline = QLabel("local assistant")
        title_column = QVBoxLayout()
        title_column.setContentsMargins(0, 0, 0, 0)
        title_column.setSpacing(4)
        title_column.addWidget(self.wordmark)
        title_column.addWidget(self.tagline)
        layout.addLayout(title_column)

        self.month_strip = MonthStrip(self.palette_colors)
        layout.addWidget(self.month_strip, 1)

        self.history_button = QPushButton("History")
        self.history_button.setProperty("role", "ghost")
        self.history_button.setCheckable(True)
        self.history_button.clicked.connect(self._toggle_history)
        layout.addWidget(self.history_button)

        self.settings_button = QPushButton("Settings")
        self.settings_button.setProperty("role", "ghost")
        self.settings_button.clicked.connect(self.open_settings)
        layout.addWidget(self.settings_button)
        return bar

    # ----------------------------------------------------- left: readings

    def _build_left_column(self) -> QWidget:
        column = QWidget()
        column.setStyleSheet("background: transparent;")
        layout = QVBoxLayout(column)
        layout.setContentsMargins(0, 0, 6, 0)
        layout.setSpacing(10)

        # Clock and calendar.
        self.clock_panel = HudPanel(self.palette_colors, "Time and date")
        self.clock_gauge = RingGauge(self.palette_colors, "clock", 96)
        self.date_gauge = RingGauge(self.palette_colors, "today", 96)
        clock_row = QHBoxLayout()
        clock_row.setSpacing(6)
        clock_row.addStretch(1)
        clock_row.addWidget(self.clock_gauge)
        clock_row.addWidget(self.date_gauge)
        clock_row.addStretch(1)
        self.clock_panel.body.addLayout(clock_row)
        layout.addWidget(self.clock_panel)

        # Machine readings.
        self.system_panel = HudPanel(self.palette_colors, "This computer")
        self.cpu_gauge = RingGauge(self.palette_colors, "processor", 96)
        self.memory_gauge = RingGauge(self.palette_colors, "memory", 96)
        gauge_row = QHBoxLayout()
        gauge_row.setSpacing(6)
        gauge_row.addStretch(1)
        gauge_row.addWidget(self.cpu_gauge)
        gauge_row.addWidget(self.memory_gauge)
        gauge_row.addStretch(1)
        self.system_panel.body.addLayout(gauge_row)

        self.disk_bar = BarGauge(self.palette_colors, "Disk in use")
        self.system_panel.body.addWidget(self.disk_bar)

        self.uptime_label = QLabel("Running for —")
        self.memory_label = QLabel("Memory —")
        for label in (self.uptime_label, self.memory_label):
            label.setWordWrap(True)
            self.system_panel.body.addWidget(label)
        layout.addWidget(self.system_panel)

        # What Mairo itself is running with.
        self.assistant_panel = HudPanel(self.palette_colors, "Assistant")
        self.model_label = QLabel()
        self.voice_label = QLabel()
        self.listen_label = QLabel()
        self.memory_count_label = QLabel()
        self.conversation_count_label = QLabel()
        self.wake_label = QLabel()
        self._assistant_labels = [
            self.model_label,
            self.voice_label,
            self.listen_label,
            self.wake_label,
            self.memory_count_label,
            self.conversation_count_label,
        ]
        for label in self._assistant_labels:
            label.setWordWrap(True)
            self.assistant_panel.body.addWidget(label)
        layout.addWidget(self.assistant_panel)

        self.weather_panel = WeatherPanel(self.settings, self.palette_colors)
        layout.addWidget(self.weather_panel)
        layout.addStretch(1)
        self.refresh_assistant_panel()

        scroller = QScrollArea()
        scroller.setWidget(column)
        scroller.setWidgetResizable(True)
        scroller.setFixedWidth(LEFT_COLUMN_WIDTH)
        scroller.setFrameShape(QFrame.NoFrame)
        scroller.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroller.setStyleSheet("background: transparent;")
        return scroller

    def refresh_assistant_panel(self) -> None:
        """Restate what Mairo is running with, after any change that affects it."""
        voice_engine = "System voice" if self.settings.tts_provider == "system" else "OpenAI voice"
        if not self.settings.voice_output_enabled:
            voice_engine = "Replies not spoken"
        recogniser = "OpenAI" if self.settings.stt_provider == "openai" else "Google"

        self.model_label.setText(f"Thinking with {self.settings.active_model}")
        self.voice_label.setText(f"Speaking with {voice_engine}")
        self.listen_label.setText(f"Listening with {recogniser}")
        try:
            remembered = len(self.memory.all())
            saved = len(self.conversations.list_conversations())
        except Exception:  # a locked database must not break the panel
            remembered = saved = 0
        self.memory_count_label.setText(
            f"{remembered} thing{'' if remembered == 1 else 's'} remembered"
        )
        self.conversation_count_label.setText(
            f"{saved} saved conversation{'' if saved == 1 else 's'}"
        )
        if self.settings.wake_word_enabled:
            detector = getattr(self.voice, "wake_detector", None)
            self.wake_label.setText(
                f"Wake word “{self.settings.wake_word}” is on"
                if getattr(detector, "available", False)
                else "Wake word is on but no engine is installed"
            )
        else:
            self.wake_label.setText("Wake word is off")

    # ----------------------------------------------------- centre: Mairo

    def _build_centre_column(self) -> QWidget:
        column = QWidget()
        layout = QVBoxLayout(column)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)
        layout.addWidget(self._build_banner())

        self.orb = OrbWidget(self.palette_colors)
        layout.addWidget(self.orb, 1)

        self.waveform = WaveformWidget(self.palette_colors)
        layout.addWidget(self.waveform)

        self.status = StatusIndicator(self.palette_colors)
        status_row = QHBoxLayout()
        status_row.addStretch(1)
        status_row.addWidget(self.status)
        status_row.addStretch(1)
        layout.addLayout(status_row)

        self.empty_state = EmptyState(self.palette_colors)
        layout.addWidget(self.empty_state)
        layout.addWidget(self._build_input_row())
        return column

    def _build_banner(self) -> QWidget:
        self.banner = QFrame()
        self.banner.setObjectName("banner")
        self.banner.setVisible(False)
        layout = QHBoxLayout(self.banner)
        layout.setContentsMargins(14, 10, 14, 10)
        self.banner_label = QLabel("")
        self.banner_label.setWordWrap(True)
        layout.addWidget(self.banner_label, 1)
        self.banner_button = QPushButton("Open settings")
        self.banner_button.clicked.connect(self.open_settings)
        layout.addWidget(self.banner_button)
        return self.banner

    def _build_input_row(self) -> QWidget:
        row = QWidget()
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(11)

        self.input = QLineEdit()
        self.input.setPlaceholderText("Type to Mairo, or use the microphone…")
        self.input.returnPressed.connect(self._send_typed)
        self.input.setMinimumHeight(44)
        layout.addWidget(self.input, 1)

        self.send_button = QPushButton("Send")
        self.send_button.setMinimumHeight(44)
        self.send_button.clicked.connect(self._send_typed)
        layout.addWidget(self.send_button)

        self.mic_button = QPushButton(MIC_IDLE)
        self.mic_button.setProperty("role", "primary")
        self.mic_button.setMinimumHeight(44)
        self.mic_button.setMinimumWidth(170)
        self.mic_button.clicked.connect(self.toggle_listening)
        layout.addWidget(self.mic_button)
        return row

    # ------------------------------------------- right: talk and shortcuts

    def _build_right_column(self) -> QWidget:
        """Two pages in one column, so opening history never squeezes the middle."""
        self.right_stack = QStackedWidget()
        self.right_stack.setFixedWidth(RIGHT_COLUMN_WIDTH)

        column = QWidget()
        layout = QVBoxLayout(column)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        self.conversation_panel = HudPanel(self.palette_colors, "Conversation")
        self.transcript = TranscriptView(self.palette_colors)
        self.transcript.setMinimumHeight(180)
        self.conversation_panel.body.addWidget(self.transcript)
        layout.addWidget(self.conversation_panel, 1)

        self.actions_panel = HudPanel(self.palette_colors, "Quick actions")
        grid = QGridLayout()
        grid.setSpacing(7)
        self.quick_buttons: list[QPushButton] = []
        for index, (label, request) in enumerate(QUICK_ACTIONS):
            button = QPushButton(label)
            button.setToolTip(f'Sends: "{request}"')
            button.setMinimumHeight(34)
            button.clicked.connect(lambda _checked=False, text=request: self.ask(text))
            grid.addWidget(button, index // 2, index % 2)
            self.quick_buttons.append(button)
        self.actions_panel.body.addLayout(grid)
        layout.addWidget(self.actions_panel)

        self.network_panel = HudPanel(self.palette_colors, "Network")
        self.network_graph = ThroughputGraph(self.palette_colors)
        self.network_panel.body.addWidget(self.network_graph)
        layout.addWidget(self.network_panel)

        self.history = HistoryPanel(self.conversations, self.palette_colors)
        self.history.conversation_opened.connect(self._open_conversation)
        self.history.new_conversation_requested.connect(self._new_conversation)
        self.history.history_cleared.connect(self._history_cleared)

        self.right_stack.addWidget(column)
        self.right_stack.addWidget(self.history)
        return self.right_stack

    def _install_shortcuts(self) -> None:
        QShortcut(QKeySequence("Ctrl+M"), self, activated=self.toggle_listening)
        QShortcut(QKeySequence("Ctrl+N"), self, activated=self._new_conversation)
        QShortcut(QKeySequence("Ctrl+H"), self, activated=self.history_button.click)
        QShortcut(QKeySequence("Ctrl+,"), self, activated=self.open_settings)
        QShortcut(QKeySequence("Escape"), self, activated=self._stop_everything)

    # -------------------------------------------------------------- clock

    def _start_clock(self) -> None:
        self._clock_timer = QTimer(self)
        self._clock_timer.timeout.connect(self._update_clock)
        self._clock_timer.start(1000)
        self._update_clock()

    def _update_clock(self) -> None:
        now = datetime.now()
        self.clock_gauge.set_reading(
            now.second / 60 * 100, now.strftime("%H:%M"), now.strftime("%A")
        )
        days_in_month = calendar.monthrange(now.year, now.month)[1]
        self.date_gauge.set_reading(
            now.day / days_in_month * 100, f"{now.day}", now.strftime("%b %Y")
        )

    @Slot(object)
    def _on_system_reading(self, reading: SystemReading) -> None:
        self.cpu_gauge.set_reading(reading.cpu_percent)
        self.memory_gauge.set_reading(reading.memory_percent)
        self.disk_bar.set_reading(
            reading.disk_percent,
            f"{reading.disk_free_gb:.0f} GB free" if reading.disk_free_gb is not None else "—",
        )
        self.uptime_label.setText(f"Running for {reading.uptime_text}")
        if reading.memory_used_gb is not None and reading.memory_total_gb is not None:
            self.memory_label.setText(
                f"Memory {reading.memory_used_gb:.1f} of {reading.memory_total_gb:.1f} GB"
            )
        else:
            self.memory_label.setText("Memory readings need the psutil package")
        self.network_graph.add_sample(reading.download_kbps, reading.upload_kbps)

    # -------------------------------------------------------------- theme

    def _apply_theme(self) -> None:
        palette = get_palette(self.settings.theme)
        self.palette_colors = palette
        self.setStyleSheet(build_stylesheet(palette))
        self.starfield.set_palette_colors(palette)
        self.orb.set_palette_colors(palette)
        self.waveform.set_palette_colors(palette)
        self.status.set_palette_colors(palette)
        self.transcript.set_palette_colors(palette)
        self.empty_state.set_palette_colors(palette)
        self.history.apply_palette(palette)
        self.month_strip.set_palette_colors(palette)
        self.network_graph.set_palette_colors(palette)
        self.disk_bar.set_palette_colors(palette)
        for gauge in (self.clock_gauge, self.date_gauge, self.cpu_gauge, self.memory_gauge):
            gauge.set_palette_colors(palette)
        for panel in (
            self.clock_panel,
            self.system_panel,
            self.assistant_panel,
            self.weather_panel,
            self.conversation_panel,
            self.actions_panel,
            self.network_panel,
        ):
            panel.apply_palette(palette)

        self.wordmark.setStyleSheet(
            f"color: {palette.text}; font-size: 24px; font-weight: 600; letter-spacing: 7px;"
        )
        self.tagline.setStyleSheet(
            f"color: {palette.text_dim}; font-size: 11px; letter-spacing: 3px;"
        )
        for label in [self.uptime_label, self.memory_label] + self._assistant_labels:
            label.setStyleSheet(f"color: {palette.text_dim}; font-size: 11px;")
        self.banner.setStyleSheet(
            f"QFrame#banner {{ background-color: {palette.panel_alt};"
            f" border: 1px solid {palette.danger}; border-radius: 10px; }}"
            f"QFrame#banner QLabel {{ background: transparent; border: none; }}"
        )
        self.banner_label.setStyleSheet(f"color: {palette.text};")

    def resizeEvent(self, event) -> None:  # noqa: N802 - Qt naming
        super().resizeEvent(event)
        size = self.centralWidget().size()
        self.starfield.resize(size)
        self.content.resize(size)

    # --------------------------------------------------------- first run

    def _first_run_checks(self) -> None:
        if not self.settings.first_run_complete:
            dialog = OnboardingDialog(self.settings, self.voice, self.palette_colors, self)
            dialog.exec()
            self._apply_theme()

        if not self.settings.has_api_key:
            self.show_banner(
                f"No OpenAI API key found. Add OPENAI_API_KEY to {env_file()} and restart Mairo."
            )
            self._add_message(
                tr.SYSTEM,
                "Mairo has no API key yet, so it cannot answer questions. Copy .env.example to "
                ".env in the desktop folder, add your OpenAI key, then restart.",
            )
        else:
            self._add_message(
                tr.SYSTEM,
                f"Mairo is online using {self.settings.active_model}. "
                "Press the microphone or type a request.",
            )

        ok, message = self.voice.test_microphone()
        if not ok:
            self._add_message(tr.SYSTEM, f"{message} You can still type to Mairo.")
            self.mic_button.setEnabled(False)
            self.mic_button.setToolTip(message)

    def _start_wake_word(self) -> None:
        """Listen for the wake phrase, if the user asked for it and it can work."""
        if not self.settings.wake_word_enabled:
            return
        detector = getattr(self.voice, "wake_detector", None)
        if detector is None:
            return
        if not getattr(detector, "available", False):
            if not self._wake_word_notice_shown:
                self._wake_word_notice_shown = True
                self._add_message(tr.SYSTEM, detector.status_text)
            return
        if detector.is_running or (self._worker is not None and self._worker.isRunning()):
            return
        detector.start(self.wake_word_heard.emit)
        log.info("Wake word listening started")

    def _stop_wake_word(self) -> None:
        detector = getattr(self.voice, "wake_detector", None)
        if detector is None:
            return
        try:
            detector.stop()
        except Exception as exc:
            log.debug("Stopping the wake word failed: %s", exc)

    @Slot()
    def _on_wake_word(self) -> None:
        """The phrase was heard: take the microphone and start a turn."""
        if self._worker is not None and self._worker.isRunning():
            return
        self.toggle_listening()

    def show_banner(self, text: str) -> None:
        self.banner_label.setText(text)
        self.banner.setVisible(True)

    # ------------------------------------------------------------ turns

    def ask(self, text: str) -> None:
        """Send a request as though the user had typed it."""
        if self._worker is not None and self._worker.isRunning():
            return
        self._add_message(tr.USER, text)
        self._start_turn(text=text)

    def toggle_listening(self) -> None:
        if self._listening:
            self.voice.stop_recording()
            self.mic_button.setText("Processing…")
            self.mic_button.setEnabled(False)
            return
        if self._worker is not None and self._worker.isRunning():
            return
        self._start_turn(text=None)

    def _send_typed(self) -> None:
        text = self.input.text().strip()
        if not text:
            return
        if self._worker is not None and self._worker.isRunning():
            return
        self.input.clear()
        self._add_message(tr.USER, text)
        self._start_turn(text=text)

    def _start_turn(self, text: str | None) -> None:
        try:
            self.brain.check_ready()
        except MairoError as exc:
            self._add_message(tr.ERROR, exc.display())
            self.orb.set_state("error")
            self.status.set_state("error")
            return

        self.empty_state.setVisible(False)
        self._listening = text is None
        if self._listening:
            self.mic_button.setText(MIC_ACTIVE)
            self.waveform.set_active(True)
        self.send_button.setEnabled(False)
        self._set_quick_actions_enabled(False)
        self._stop_wake_word()

        worker = AssistantWorker(self.brain, self.voice, text=text, speak_reply=True, parent=self)
        worker.status_changed.connect(self._on_status)
        worker.level_changed.connect(self._on_level)
        worker.heard.connect(lambda said: self._add_message(tr.USER, said))
        worker.replied.connect(lambda reply: self._add_message(tr.MAIRO, reply))
        worker.tool_ran.connect(self._on_tool)
        worker.failed.connect(self._on_failure)
        worker.finished_turn.connect(self._on_turn_finished)
        worker.confirmation_needed.connect(self._on_confirmation, Qt.QueuedConnection)
        worker.finished.connect(worker.deleteLater)
        self._worker = worker
        worker.start()

    def _set_quick_actions_enabled(self, enabled: bool) -> None:
        for button in self.quick_buttons:
            button.setEnabled(enabled)

    def _stop_everything(self) -> None:
        if self._worker is not None and self._worker.isRunning():
            self._worker.cancel()
        self.voice.stop_speaking()

    # ------------------------------------------------------------ signals

    @Slot(str)
    def _on_status(self, state: str) -> None:
        self.status.set_state(state)
        orb_state = state if state in ("listening", "thinking", "speaking", "error") else "ready"
        if state in ("acting", "waiting"):
            orb_state = "thinking"
        self.orb.set_state(orb_state)
        self.waveform.set_active(state in ("listening", "speaking"))

    @Slot(float)
    def _on_level(self, level: float) -> None:
        self.orb.set_level(level)
        self.waveform.set_level(level)

    @Slot(str, str)
    def _on_tool(self, tool_name: str, outcome: str) -> None:
        self._add_message(tr.ACTION, f"{tool_name.replace('_', ' ')} — {outcome}")

    @Slot(str)
    def _on_failure(self, message: str) -> None:
        self._add_message(tr.ERROR, message)
        self.orb.set_state("error")
        self.status.set_state("error")
        log.warning("Turn failed: %s", message)

    @Slot()
    def _on_turn_finished(self) -> None:
        self._listening = False
        self.mic_button.setText(MIC_IDLE)
        self.mic_button.setEnabled(True)
        self.send_button.setEnabled(True)
        self._set_quick_actions_enabled(True)
        self.waveform.set_active(False)
        self.history.refresh()
        self.refresh_assistant_panel()
        self._worker = None
        self._start_wake_word()

    @Slot(object)
    def _on_confirmation(self, request: ConfirmationRequest) -> None:
        """Ask before a risky action, from the UI thread."""
        box = QMessageBox(self)
        box.setWindowTitle("Confirm action")
        box.setIcon(QMessageBox.Warning)
        box.setText(request.question)
        box.setInformativeText("Mairo will only continue if you allow it.")
        allow = box.addButton("Allow", QMessageBox.AcceptRole)
        box.addButton("Decline", QMessageBox.RejectRole)
        box.setDefaultButton(allow)
        box.exec()
        request.answer(box.clickedButton() is allow)

    # ------------------------------------------------------- conversation

    def _add_message(self, kind: str, text: str) -> None:
        if not text:
            return
        self.empty_state.setVisible(False)
        self.transcript.add_message(kind, text)

    def _new_conversation(self) -> None:
        self._show_conversation_page()
        self.conversations.start_new()
        self.transcript.clear_messages()
        self.empty_state.setVisible(True)
        self.history.refresh()
        self.status.set_state("ready")
        self.orb.set_state("ready")

    def _open_conversation(self, conversation_id: int) -> None:
        self._show_conversation_page()
        messages = self.conversations.open(conversation_id)
        self.transcript.clear_messages()
        self.empty_state.setVisible(not messages)
        for message in messages:
            kind = tr.USER if message.role == "user" else tr.MAIRO
            self.transcript.add_message(kind, message.content)

    def _history_cleared(self) -> None:
        if self.conversations.current_id is None:
            self.transcript.clear_messages()
            self.empty_state.setVisible(True)

    def _toggle_history(self, checked: bool) -> None:
        self.right_stack.setCurrentIndex(1 if checked else 0)
        if checked:
            self.history.refresh()

    def _show_conversation_page(self) -> None:
        self.history_button.setChecked(False)
        self.right_stack.setCurrentIndex(0)

    # ------------------------------------------------------------ settings

    def open_settings(self) -> None:
        before = (self.settings.theme, self.settings.save_history)
        dialog = SettingsDialog(self.settings, self.voice, self)
        if dialog.exec() == SettingsDialog.Accepted:
            self.voice.refresh_providers()
            self.conversations.set_enabled(self.settings.save_history)
            if self.settings.theme != before[0]:
                self._apply_theme()
            if self.settings.has_api_key:
                self.banner.setVisible(False)
            self._stop_wake_word()
            self._wake_word_notice_shown = False
            self._start_wake_word()
            self.refresh_assistant_panel()
            self.weather_panel.location_changed()
            self._add_message(tr.SYSTEM, "Settings saved.")

    # ------------------------------------------------------------ closing

    def closeEvent(self, event) -> None:  # noqa: N802 - Qt naming
        self._stop_everything()
        self._stop_wake_word()
        self.monitor.stop()
        if self._worker is not None:
            self._worker.wait(2500)
        log.info("Mairo closed. Logs are in %s", logs_dir())
        super().closeEvent(event)
