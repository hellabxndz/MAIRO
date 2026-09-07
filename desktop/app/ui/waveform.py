"""A slim bar visualiser shown under the orb while audio is moving."""

from __future__ import annotations

import math
import random
from collections import deque

from PySide6.QtCore import QRectF, Qt, QTimer
from PySide6.QtGui import QColor, QLinearGradient, QPainter
from PySide6.QtWidgets import QSizePolicy, QWidget

from app.ui.theme import Palette

BARS = 48
FRAME_MS = 33


class WaveformWidget(QWidget):
    """Reacts to the microphone level, and idles as a flat line."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._active = False
        self._level = 0.0
        self._phase = 0.0
        self._smoothed = 0.0
        self._bars: deque[float] = deque([0.0] * BARS, maxlen=BARS)
        self._seeds = [random.uniform(0.35, 1.0) for _ in range(BARS)]

        self.setFixedHeight(56)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._advance)
        self._timer.start(FRAME_MS)

    def set_active(self, active: bool) -> None:
        self._active = active
        if not active:
            self._level = 0.0

    def set_level(self, level: float) -> None:
        self._level = max(0.0, min(1.0, level * 6.0))

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self.update()

    def _advance(self) -> None:
        self._phase += FRAME_MS / 1000.0
        target = self._level if self._active else 0.0
        # Ease towards the new level so the bars glide instead of snapping.
        self._smoothed += (target - self._smoothed) * 0.28
        self._bars.append(self._smoothed)
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        if self.width() <= 0:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)

        gradient = QLinearGradient(0, 0, self.width(), 0)
        start = QColor(self.palette_colors.secondary)
        middle = QColor(self.palette_colors.accent_soft)
        end = QColor(self.palette_colors.secondary)
        alpha = 215 if self._active else 90
        for color in (start, middle, end):
            color.setAlpha(alpha)
        gradient.setColorAt(0.0, start)
        gradient.setColorAt(0.5, middle)
        gradient.setColorAt(1.0, end)
        painter.setPen(Qt.NoPen)
        painter.setBrush(gradient)

        slot = self.width() / BARS
        bar_width = max(2.0, slot * 0.42)
        centre_y = self.height() / 2
        headroom = self.height() - 8
        level = self._smoothed

        for index in range(BARS):
            # Every bar answers to the current level; the sine envelope keeps
            # the ends short so the visualiser reads as one shape.
            envelope = math.sin(math.pi * (index + 0.5) / BARS)
            wobble = 0.5 + 0.5 * math.sin(self._phase * 7.5 + index * 0.55)
            resting = 2.0 * envelope
            height = resting + level * envelope * (0.35 + 0.65 * wobble) * self._seeds[index] * headroom
            if height < 0.6:
                continue
            x = index * slot + (slot - bar_width) / 2
            painter.drawRoundedRect(
                QRectF(x, centre_y - height / 2, bar_width, height),
                bar_width / 2,
                bar_width / 2,
            )
        painter.end()
