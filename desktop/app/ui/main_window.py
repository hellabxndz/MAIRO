"""The Mairo window: orb, transcript, controls and the panels around them."""

from __future__ import annotations

from typing import Any

from PySide6.QtCore import Qt, QTimer, Slot
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from app.ai.brain import Brain
from app.ai.conversation import ConversationStore
from app.config.paths import env_file, logs_dir
from app.config.settings import Settings
from app.ui import transcript as tr
from app.ui.history_panel import HistoryPanel
from app.ui.onboarding import OnboardingDialog
from app.ui.orb import OrbWidget
from app.ui.settings_dialog import SettingsDialog
from app.ui.starfield import Starfield
from app.ui.status_indicator import StatusIndicator
from app.ui.theme import build_stylesheet, get_palette
from app.ui.transcript import EmptyState, TranscriptView
from app.ui.waveform import WaveformWidget
from app.ui.workers import AssistantWorker, ConfirmationRequest
from app.utils.errors import MairoError
from app.utils.logging_setup import get_logger
from app.voice.manager import VoiceManager

log = get_logger("ui.window")

WINDOW_TITLE = "Mairo"
MIC_IDLE = "🎙  Hold to speak"
MIC_ACTIVE = "■  Stop listening"


class MainWindow(QMainWindow):
    """Everything the user sees once Mairo is running."""

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

        self.setWindowTitle(WINDOW_TITLE)
        self.resize(1080, 760)
        self.setMinimumSize(880, 620)

        self._build_ui()
        self._apply_theme()
        self._install_shortcuts()
        QTimer.singleShot(150, self._first_run_checks)

    # ----------------------------------------------------------- building

    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)

        self.starfield = Starfield(self.palette_colors, central)
        self.starfield.lower()

        self.content = QWidget(central)
        root = QHBoxLayout(self.content)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        column = QVBoxLayout()
        column.setContentsMargins(26, 18, 26, 22)
        column.setSpacing(14)
        column.addWidget(self._build_top_bar())
        column.addWidget(self._build_banner())

        self.orb = OrbWidget(self.palette_colors)
        column.addWidget(self.orb, 3)

        self.waveform = WaveformWidget(self.palette_colors)
        column.addWidget(self.waveform)

        self.status = StatusIndicator(self.palette_colors)
        status_row = QHBoxLayout()
        status_row.addStretch(1)
        status_row.addWidget(self.status)
        status_row.addStretch(1)
        column.addLayout(status_row)

        self.empty_state = EmptyState(self.palette_colors)
        column.addWidget(self.empty_state)

        self.transcript = TranscriptView(self.palette_colors)
        self.transcript.setMinimumHeight(170)
        column.addWidget(self.transcript, 2)

        column.addWidget(self._build_input_row())

        left = QWidget()
        left.setLayout(column)
        root.addWidget(left, 1)

        self.history = HistoryPanel(self.conversations, self.palette_colors)
        self.history.conversation_opened.connect(self._open_conversation)
        self.history.new_conversation_requested.connect(self._new_conversation)
        self.history.history_cleared.connect(self._history_cleared)
        self.history.setVisible(False)
        root.addWidget(self.history)

    def _build_top_bar(self) -> QWidget:
        bar = QWidget()
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        self.wordmark = QLabel("M A I R O")
        self.wordmark.setProperty("role", "title")
        self.tagline = QLabel("local assistant")
        self.tagline.setProperty("role", "caption")

        title_column = QVBoxLayout()
        title_column.setContentsMargins(0, 0, 0, 0)
        title_column.setSpacing(6)
        title_column.addWidget(self.wordmark)
        title_column.addWidget(self.tagline)
        layout.addLayout(title_column)
        layout.addStretch(1)

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
        self.mic_button.setMinimumWidth(180)
        self.mic_button.clicked.connect(self.toggle_listening)
        layout.addWidget(self.mic_button)
        return row

    def _install_shortcuts(self) -> None:
        QShortcut(QKeySequence("Ctrl+M"), self, activated=self.toggle_listening)
        QShortcut(QKeySequence("Ctrl+N"), self, activated=self._new_conversation)
        QShortcut(QKeySequence("Ctrl+H"), self, activated=self.history_button.click)
        QShortcut(QKeySequence("Ctrl+,"), self, activated=self.open_settings)
        QShortcut(QKeySequence("Escape"), self, activated=self._stop_everything)

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
        self.wordmark.setStyleSheet(
            f"color: {palette.text}; font-size: 24px; font-weight: 600; letter-spacing: 7px;"
        )
        self.tagline.setStyleSheet(
            f"color: {palette.text_dim}; font-size: 11px; letter-spacing: 3px;"
        )
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
                "No OpenAI API key found. Add OPENAI_API_KEY to "
                f"{env_file()} and restart Mairo."
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

    def show_banner(self, text: str) -> None:
        self.banner_label.setText(text)
        self.banner.setVisible(True)

    # ------------------------------------------------------------ turns

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
        self.waveform.set_active(False)
        self.history.refresh()
        self._worker = None

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
        self.conversations.start_new()
        self.transcript.clear_messages()
        self.empty_state.setVisible(True)
        self.history.refresh()
        self.status.set_state("ready")
        self.orb.set_state("ready")

    def _open_conversation(self, conversation_id: int) -> None:
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
        self.history.setVisible(checked)
        if checked:
            self.history.refresh()

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
            self._add_message(tr.SYSTEM, "Settings saved.")

    # ------------------------------------------------------------ closing

    def closeEvent(self, event) -> None:  # noqa: N802 - Qt naming
        self._stop_everything()
        if self._worker is not None:
            self._worker.wait(2500)
        log.info("Mairo closed. Logs are in %s", logs_dir())
        super().closeEvent(event)
