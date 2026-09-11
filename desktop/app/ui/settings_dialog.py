"""The settings screen: model, voice, microphone, wake word, theme."""

from __future__ import annotations

from typing import Any

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSlider,
    QSpinBox,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from app.config.settings import Settings
from app.ui.theme import THEMES
from app.ui.workers import SpeechWorker
from app.utils.logging_setup import get_logger
from app.utils.platform_utils import is_windows, set_startup_shortcut

log = get_logger("ui.settings")

PREVIEW_LINE = "Mairo online. Systems nominal and ready when you are."
MODEL_SUGGESTIONS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"]
NORMAL_RATE = 180  # words per minute the system voice treats as normal speed


def _wake_word_note() -> str:
    """Say plainly whether the wake word can actually work on this machine."""
    from app.voice.wake_word import access_key, porcupine_available

    if porcupine_available() and access_key():
        return (
            "Detection runs offline through Picovoice; audio never leaves this computer. "
            "A custom “Hey Mairo” phrase needs a keyword file trained free at "
            "console.picovoice.ai — set PICOVOICE_KEYWORD_FILE in .env. Without one Mairo "
            "listens for the built-in word “computer”."
        )
    if porcupine_available():
        return (
            "pvporcupine is installed, but PICOVOICE_ACCESS_KEY is missing from .env. "
            "Get a free key at console.picovoice.ai. Until then nothing listens in the "
            "background and the microphone button is the way in."
        )
    return (
        "Wake-word detection needs the pvporcupine package (pip install pvporcupine) and a "
        "free key from console.picovoice.ai. Until both are present nothing listens in the "
        "background — turning this on will not record you."
    )


def _openai_speed(words_per_minute: int) -> float:
    """Map the words-per-minute slider onto the OpenAI voice's speed multiplier."""
    return round(max(0.5, min(2.0, words_per_minute / NORMAL_RATE)), 2)


class SettingsDialog(QDialog):
    """Edits a copy of the settings and only saves on OK."""

    def __init__(self, settings: Settings, voice: Any, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.settings = settings
        self.voice = voice
        self._preview_worker: SpeechWorker | None = None

        self.setWindowTitle("Mairo settings")
        self.setMinimumWidth(520)

        tabs = QTabWidget()
        tabs.addTab(self._build_ai_tab(), "Intelligence")
        tabs.addTab(self._build_voice_tab(), "Voice")
        tabs.addTab(self._build_app_tab(), "Application")

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        buttons.button(QDialogButtonBox.Ok).setProperty("role", "primary")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(14)
        layout.addWidget(tabs)
        layout.addWidget(buttons)

    # ------------------------------------------------------------ AI tab

    def _build_ai_tab(self) -> QWidget:
        page = QWidget()
        form = QFormLayout(page)
        form.setSpacing(11)

        self.model_box = QComboBox()
        self.model_box.setEditable(True)
        self.model_box.addItems(MODEL_SUGGESTIONS)
        self.model_box.setCurrentText(self.settings.model or self.settings.active_model)
        form.addRow("AI model", self.model_box)

        env_note = QLabel(
            "Leave blank to use OPENAI_MODEL from the .env file. "
            "The API key is only ever read from .env."
        )
        env_note.setWordWrap(True)
        env_note.setProperty("role", "caption")
        form.addRow("", env_note)

        self.context_spin = QSpinBox()
        self.context_spin.setRange(2, 40)
        self.context_spin.setValue(self.settings.context_messages)
        form.addRow("Messages of context", self.context_spin)

        self.timeout_spin = QSpinBox()
        self.timeout_spin.setRange(10, 180)
        self.timeout_spin.setSuffix(" s")
        self.timeout_spin.setValue(self.settings.request_timeout)
        form.addRow("Request timeout", self.timeout_spin)

        key_state = QLabel(
            "API key detected." if self.settings.has_api_key else "No API key found in .env."
        )
        key_state.setProperty("role", "caption")
        form.addRow("Status", key_state)
        return page

    # --------------------------------------------------------- voice tab

    def _build_voice_tab(self) -> QWidget:
        page = QWidget()
        form = QFormLayout(page)
        form.setSpacing(11)

        self.speak_check = QCheckBox("Speak replies out loud")
        self.speak_check.setChecked(self.settings.voice_output_enabled)
        form.addRow("", self.speak_check)

        self.tts_box = QComboBox()
        self.tts_box.addItem("System voice (offline, free)", "system")
        self.tts_box.addItem("OpenAI voice (higher quality, uses the API)", "openai")
        index = self.tts_box.findData(self.settings.tts_provider)
        self.tts_box.setCurrentIndex(max(0, index))
        self.tts_box.currentIndexChanged.connect(self._reload_voices)
        form.addRow("Voice engine", self.tts_box)

        self.voice_box = QComboBox()
        voice_row = QHBoxLayout()
        voice_row.addWidget(self.voice_box, 1)
        preview = QPushButton("Preview")
        preview.clicked.connect(self._preview_voice)
        voice_row.addWidget(preview)
        voice_holder = QWidget()
        voice_holder.setLayout(voice_row)
        form.addRow("Voice", voice_holder)

        self.rate_slider = QSlider(Qt.Horizontal)
        self.rate_slider.setRange(90, 320)
        self.rate_slider.setValue(self.settings.speech_rate)
        self.rate_label = QLabel(f"{self.settings.speech_rate} wpm")
        self.rate_slider.valueChanged.connect(self._update_rate_label)
        rate_row = QHBoxLayout()
        rate_row.addWidget(self.rate_slider, 1)
        rate_row.addWidget(self.rate_label)
        rate_holder = QWidget()
        rate_holder.setLayout(rate_row)
        form.addRow("Speaking speed", rate_holder)

        self.stt_box = QComboBox()
        self.stt_box.addItem("OpenAI (accurate, uses the API key)", "openai")
        self.stt_box.addItem("Google web speech (no key, less accurate)", "google")
        stt_index = self.stt_box.findData(self.settings.stt_provider)
        self.stt_box.setCurrentIndex(max(0, stt_index))
        form.addRow("Speech recognition", self.stt_box)

        self.mic_box = QComboBox()
        self.mic_box.addItem("System default", None)
        for device_index, label in self.voice.microphones():
            self.mic_box.addItem(label, device_index)
        current = self.mic_box.findData(self.settings.input_device)
        self.mic_box.setCurrentIndex(max(0, current))
        mic_row = QHBoxLayout()
        mic_row.addWidget(self.mic_box, 1)
        test_button = QPushButton("Test")
        test_button.clicked.connect(self._test_microphone)
        mic_row.addWidget(test_button)
        mic_holder = QWidget()
        mic_holder.setLayout(mic_row)
        form.addRow("Microphone", mic_holder)

        self.record_spin = QSpinBox()
        self.record_spin.setRange(5, 120)
        self.record_spin.setSuffix(" s")
        self.record_spin.setValue(self.settings.max_record_seconds)
        form.addRow("Maximum recording", self.record_spin)

        self.wake_check = QCheckBox("Enable wake word")
        self.wake_check.setChecked(self.settings.wake_word_enabled)
        form.addRow("", self.wake_check)

        self.wake_edit = QLineEdit(self.settings.wake_word)
        form.addRow("Wake phrase", self.wake_edit)

        wake_note = QLabel(_wake_word_note())
        wake_note.setWordWrap(True)
        wake_note.setProperty("role", "caption")
        form.addRow("", wake_note)

        self._reload_voices()
        return page

    def _update_rate_label(self, value: int) -> None:
        if self.tts_box.currentData() == "openai":
            self.rate_label.setText(f"{_openai_speed(value):.2f}×")
        else:
            self.rate_label.setText(f"{value} wpm")

    def _reload_voices(self) -> None:
        provider = self.tts_box.currentData()
        self.voice_box.clear()
        self.voice_box.addItem("Default voice", "")
        for option in self.voice.available_voices(provider):
            self.voice_box.addItem(option.label, option.id)
        index = self.voice_box.findData(self.settings.tts_voice)
        self.voice_box.setCurrentIndex(max(0, index))
        self._update_rate_label(self.rate_slider.value())

    # -------------------------------------------------------- application

    def _build_app_tab(self) -> QWidget:
        page = QWidget()
        form = QFormLayout(page)
        form.setSpacing(11)

        self.theme_box = QComboBox()
        for key, palette in THEMES.items():
            self.theme_box.addItem(palette.name, key)
        theme_index = self.theme_box.findData(self.settings.theme)
        self.theme_box.setCurrentIndex(max(0, theme_index))
        form.addRow("Theme", self.theme_box)

        self.history_check = QCheckBox("Save conversation history on this computer")
        self.history_check.setChecked(self.settings.save_history)
        form.addRow("", self.history_check)

        self.startup_check = QCheckBox("Start Mairo when I sign in to Windows")
        self.startup_check.setChecked(self.settings.start_with_windows)
        self.startup_check.setEnabled(is_windows())
        form.addRow("", self.startup_check)

        if not is_windows():
            note = QLabel("Starting with the system is only available on Windows.")
            note.setProperty("role", "caption")
            form.addRow("", note)

        privacy = QLabel(
            "Conversations, memories and notes stay on this computer. Only the current request "
            "and a short window of recent messages are sent to the AI provider."
        )
        privacy.setWordWrap(True)
        privacy.setProperty("role", "caption")
        form.addRow("Privacy", privacy)
        return page

    # ------------------------------------------------------------ actions

    def _test_microphone(self) -> None:
        original = self.settings.input_device
        self.settings.input_device = self.mic_box.currentData()
        ok, message = self.voice.test_microphone()
        self.settings.input_device = original
        (QMessageBox.information if ok else QMessageBox.warning)(
            self, "Microphone", message
        )

    def _preview_voice(self) -> None:
        snapshot = (
            self.settings.tts_provider,
            self.settings.tts_voice,
            self.settings.speech_rate,
            self.settings.openai_tts_speed,
        )
        self.settings.tts_provider = self.tts_box.currentData()
        self.settings.tts_voice = self.voice_box.currentData() or ""
        self.settings.speech_rate = self.rate_slider.value()
        self.settings.openai_tts_speed = _openai_speed(self.rate_slider.value())
        self.voice.refresh_providers()

        worker = SpeechWorker(self.voice, PREVIEW_LINE, self)
        worker.failed.connect(lambda message: QMessageBox.warning(self, "Voice", message))

        def restore() -> None:
            (
                self.settings.tts_provider,
                self.settings.tts_voice,
                self.settings.speech_rate,
                self.settings.openai_tts_speed,
            ) = snapshot
            self.voice.refresh_providers()

        worker.finished.connect(restore)
        self._preview_worker = worker
        worker.start()

    def accept(self) -> None:
        self.apply()
        super().accept()

    def apply(self) -> None:
        """Copy the widgets back into the settings object and persist them."""
        self.settings.model = self.model_box.currentText().strip()
        self.settings.context_messages = self.context_spin.value()
        self.settings.request_timeout = self.timeout_spin.value()

        self.settings.voice_output_enabled = self.speak_check.isChecked()
        self.settings.tts_provider = self.tts_box.currentData() or "system"
        self.settings.tts_voice = self.voice_box.currentData() or ""
        self.settings.speech_rate = self.rate_slider.value()
        self.settings.openai_tts_speed = _openai_speed(self.rate_slider.value())
        self.settings.stt_provider = self.stt_box.currentData() or "openai"
        self.settings.input_device = self.mic_box.currentData()
        self.settings.max_record_seconds = self.record_spin.value()
        self.settings.wake_word_enabled = self.wake_check.isChecked()
        self.settings.wake_word = self.wake_edit.text().strip() or "hey mairo"

        self.settings.theme = self.theme_box.currentData() or "nebula"
        self.settings.save_history = self.history_check.isChecked()

        wanted_startup = self.startup_check.isChecked()
        if wanted_startup != self.settings.start_with_windows:
            ok, message = set_startup_shortcut(wanted_startup)
            if ok:
                self.settings.start_with_windows = wanted_startup
            else:
                self.startup_check.setChecked(self.settings.start_with_windows)
                QMessageBox.warning(self, "Startup", message)

        self.settings.save()
        log.info("Settings saved")
