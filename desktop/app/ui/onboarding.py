"""First-run setup: welcome, API key check, microphone test, voice choice."""

from __future__ import annotations

from typing import Any

from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from app.config.paths import env_file
from app.config.settings import Settings
from app.ui.orb import OrbWidget
from app.ui.theme import Palette
from app.ui.workers import SpeechWorker
from app.utils.logging_setup import get_logger

log = get_logger("ui.onboarding")

GREETING = "Hello. I am Mairo. I am ready when you are."


class OnboardingDialog(QDialog):
    """A three-step introduction shown the first time Mairo starts."""

    def __init__(
        self, settings: Settings, voice: Any, palette: Palette, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self.settings = settings
        self.voice = voice
        self.palette_colors = palette
        self._preview_worker: SpeechWorker | None = None

        self.setWindowTitle("Welcome to Mairo")
        self.setMinimumSize(560, 520)

        self.orb = OrbWidget(palette)
        self.orb.setMinimumHeight(150)
        self.orb.setMaximumHeight(170)

        self.pages = QStackedWidget()
        self.pages.addWidget(self._welcome_page())
        self.pages.addWidget(self._key_page())
        self.pages.addWidget(self._microphone_page())
        self.pages.addWidget(self._voice_page())

        self.back_button = QPushButton("Back")
        self.back_button.clicked.connect(self._go_back)
        self.next_button = QPushButton("Continue")
        self.next_button.setProperty("role", "primary")
        self.next_button.clicked.connect(self._go_next)

        controls = QHBoxLayout()
        controls.addWidget(self.back_button)
        controls.addStretch(1)
        controls.addWidget(self.next_button)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(26, 22, 26, 22)
        layout.setSpacing(14)
        layout.addWidget(self.orb)
        layout.addWidget(self.pages, 1)
        layout.addLayout(controls)
        self._update_controls()

    # --------------------------------------------------------------- pages

    def _page(self, title: str, body: str) -> tuple[QWidget, QVBoxLayout]:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(12)
        heading = QLabel(title)
        heading.setStyleSheet(
            f"color: {self.palette_colors.text}; font-size: 21px; font-weight: 600;"
        )
        text = QLabel(body)
        text.setWordWrap(True)
        text.setStyleSheet(f"color: {self.palette_colors.text_dim}; line-height: 165%;")
        layout.addWidget(heading)
        layout.addWidget(text)
        return page, layout

    def _welcome_page(self) -> QWidget:
        page, layout = self._page(
            "Welcome to Mairo",
            "Mairo is a local assistant that listens, answers and operates this computer for "
            "you. Everything it remembers stays on this machine.\n\n"
            "This short setup checks your API key, your microphone and your preferred voice.",
        )
        layout.addStretch(1)
        return page

    def _key_page(self) -> QWidget:
        if self.settings.has_api_key:
            body = (
                "An OpenAI API key was found, so Mairo can think and speak straight away.\n\n"
                f"Model in use: {self.settings.active_model}"
            )
        else:
            body = (
                "No API key was found. Mairo needs one to answer questions.\n\n"
                f"1. Open the file:\n     {env_file()}\n"
                "     (copy .env.example to .env if it is not there yet)\n"
                "2. Add the line:\n     OPENAI_API_KEY=sk-your-key-here\n"
                "3. Save the file and restart Mairo.\n\n"
                "You can finish this setup now — the interface still opens without a key."
            )
        page, layout = self._page("API key", body)
        self.key_status = QLabel(
            "Key detected." if self.settings.has_api_key else "Waiting for a key."
        )
        color = self.palette_colors.success if self.settings.has_api_key else self.palette_colors.danger
        self.key_status.setStyleSheet(f"color: {color}; font-weight: 600;")
        layout.addWidget(self.key_status)
        layout.addStretch(1)
        return page

    def _microphone_page(self) -> QWidget:
        page, layout = self._page(
            "Microphone",
            "Pick the microphone Mairo should listen through, then test it. If no microphone "
            "is available you can still type to Mairo.",
        )
        self.mic_box = QComboBox()
        self.mic_box.addItem("System default", None)
        for index, label in self.voice.microphones():
            self.mic_box.addItem(label, index)
        layout.addWidget(self.mic_box)

        test_button = QPushButton("Test microphone")
        test_button.clicked.connect(self._test_microphone)
        layout.addWidget(test_button)

        self.mic_status = QLabel("Not tested yet.")
        self.mic_status.setWordWrap(True)
        self.mic_status.setStyleSheet(f"color: {self.palette_colors.text_dim};")
        layout.addWidget(self.mic_status)
        layout.addStretch(1)
        return page

    def _voice_page(self) -> QWidget:
        page, layout = self._page(
            "Voice",
            "Choose how Mairo sounds. The system voice works offline and costs nothing; the "
            "OpenAI voice sounds better and uses your API key. You can change this any time in "
            "Settings.",
        )
        self.engine_box = QComboBox()
        self.engine_box.addItem("System voice (offline)", "system")
        self.engine_box.addItem("OpenAI voice (uses the API)", "openai")
        self.engine_box.currentIndexChanged.connect(self._reload_voices)
        layout.addWidget(self.engine_box)

        self.voice_box = QComboBox()
        layout.addWidget(self.voice_box)

        preview_button = QPushButton("Hear this voice")
        preview_button.clicked.connect(self._preview_voice)
        layout.addWidget(preview_button)

        self.voice_status = QLabel("")
        self.voice_status.setWordWrap(True)
        self.voice_status.setStyleSheet(f"color: {self.palette_colors.text_dim};")
        layout.addWidget(self.voice_status)
        layout.addStretch(1)
        self._reload_voices()
        return page

    # ------------------------------------------------------------- actions

    def _reload_voices(self) -> None:
        provider = self.engine_box.currentData()
        self.voice_box.clear()
        self.voice_box.addItem("Default voice", "")
        options = self.voice.available_voices(provider)
        for option in options:
            self.voice_box.addItem(option.label, option.id)
        if provider == "system" and not options:
            self.voice_status.setText(
                "No system voices were found. Add one under Windows Settings › Time & language "
                "› Speech, or use the OpenAI voice."
            )
        else:
            self.voice_status.setText("")

    def _test_microphone(self) -> None:
        original = self.settings.input_device
        self.settings.input_device = self.mic_box.currentData()
        ok, message = self.voice.test_microphone()
        self.settings.input_device = original
        self.mic_status.setText(message)
        color = self.palette_colors.success if ok else self.palette_colors.danger
        self.mic_status.setStyleSheet(f"color: {color};")

    def _preview_voice(self) -> None:
        self._commit_voice_choice()
        self.voice.refresh_providers()
        worker = SpeechWorker(self.voice, GREETING, self)
        worker.failed.connect(self.voice_status.setText)
        self._preview_worker = worker
        worker.start()

    def _commit_voice_choice(self) -> None:
        self.settings.tts_provider = self.engine_box.currentData() or "system"
        self.settings.tts_voice = self.voice_box.currentData() or ""

    def _go_back(self) -> None:
        self.pages.setCurrentIndex(max(0, self.pages.currentIndex() - 1))
        self._update_controls()

    def _go_next(self) -> None:
        if self.pages.currentIndex() == self.pages.count() - 1:
            self.accept()
            return
        self.pages.setCurrentIndex(self.pages.currentIndex() + 1)
        self._update_controls()

    def _update_controls(self) -> None:
        last = self.pages.currentIndex() == self.pages.count() - 1
        self.back_button.setEnabled(self.pages.currentIndex() > 0)
        self.next_button.setText("Enter Mairo" if last else "Continue")

    def accept(self) -> None:
        self.settings.input_device = self.mic_box.currentData()
        self._commit_voice_choice()
        self.settings.first_run_complete = True
        self.settings.save()
        self.voice.refresh_providers()
        log.info("First-run setup complete")
        super().accept()
