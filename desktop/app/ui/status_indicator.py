"""The small pill that names the assistant's current state."""

from __future__ import annotations

from PySide6.QtCore import QTimer, Qt
from PySide6.QtWidgets import QHBoxLayout, QLabel, QWidget

from app.ui.theme import Palette

STATES = {
    "ready": ("Ready", "accent"),
    "listening": ("Listening", "secondary"),
    "thinking": ("Thinking", "accent_soft"),
    "acting": ("Working", "accent_soft"),
    "waiting": ("Awaiting confirmation", "secondary"),
    "speaking": ("Speaking", "accent_soft"),
    "error": ("Attention needed", "danger"),
}


class StatusIndicator(QWidget):
    """A pulsing dot plus a word, e.g. "Listening"."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._state = "ready"
        self._bright = True

        self.dot = QLabel("●")
        self.dot.setAlignment(Qt.AlignCenter)
        self.text = QLabel("Ready")
        self.text.setProperty("role", "subtitle")

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(9)
        layout.addWidget(self.dot)
        layout.addWidget(self.text)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._pulse)
        self._timer.start(620)
        self._restyle()

    def set_state(self, state: str) -> None:
        self._state = state if state in STATES else "ready"
        self._restyle()

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self._restyle()

    def current_label(self) -> str:
        return STATES[self._state][0]

    def _color(self) -> str:
        return getattr(self.palette_colors, STATES[self._state][1])

    def _pulse(self) -> None:
        if self._state in ("ready", "error"):
            self._bright = True
        else:
            self._bright = not self._bright
        self._restyle()

    def _restyle(self) -> None:
        label, _ = STATES[self._state]
        color = self._color()
        opacity = "1.0" if self._bright else "0.35"
        self.dot.setStyleSheet(f"color: {color}; font-size: 13px; opacity: {opacity};")
        self.dot.setText("●" if self._bright else "○")
        self.text.setText(label.upper())
        self.text.setStyleSheet(
            f"color: {color}; letter-spacing: 3px; font-size: 12px; font-weight: 600;"
        )
