"""The glowing orb at the centre of the window.

One widget covers every state: it breathes when idle, blooms with the user's
voice when listening, spins its rings while thinking, and ripples while Mairo
speaks. Colour comes from the active palette so themes carry through.
"""

from __future__ import annotations

import math
import random
from collections import deque

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer
from PySide6.QtGui import QColor, QConicalGradient, QPainter, QPen, QRadialGradient
from PySide6.QtWidgets import QSizePolicy, QWidget

from app.ui.theme import Palette

FRAME_MS = 33
SPIKES = 96
LEVEL_HISTORY = 24

READY = "ready"
LISTENING = "listening"
THINKING = "thinking"
SPEAKING = "speaking"
ERROR = "error"


class OrbWidget(QWidget):
    """An animated sphere that shows what the assistant is doing."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._state = READY
        self._phase = 0.0
        self._spin = 0.0
        self._level = 0.0
        self._smoothed = 0.0
        self._history: deque[float] = deque([0.0] * LEVEL_HISTORY, maxlen=LEVEL_HISTORY)
        self._noise = [random.uniform(0, math.tau) for _ in range(SPIKES)]

        self.setMinimumSize(240, 240)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._advance)
        self._timer.start(FRAME_MS)

    # --------------------------------------------------------------- state

    @property
    def state(self) -> str:
        return self._state

    def set_state(self, state: str) -> None:
        if state != self._state:
            self._state = state
            if state != LISTENING:
                self._level = 0.0
            self.update()

    def set_level(self, level: float) -> None:
        """Feed the live microphone level, 0.0 to roughly 1.0."""
        self._level = max(0.0, min(1.0, level * 6.0))

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self.update()

    # ------------------------------------------------------------ animation

    def _advance(self) -> None:
        step = FRAME_MS / 1000.0
        self._phase += step
        speed = {THINKING: 2.4, SPEAKING: 1.5, LISTENING: 1.0}.get(self._state, 0.35)
        self._spin += step * speed

        if self._state == SPEAKING:
            # A gentle synthetic ripple stands in for output level.
            target = 0.34 + 0.24 * abs(math.sin(self._phase * 5.1)) + 0.1 * math.sin(self._phase * 11.3)
        elif self._state == LISTENING:
            target = self._level
        elif self._state == THINKING:
            target = 0.22 + 0.1 * math.sin(self._phase * 3.0)
        else:
            target = 0.0

        self._smoothed += (target - self._smoothed) * 0.25
        self._history.append(self._smoothed)
        self.update()

    # -------------------------------------------------------------- colours

    def _state_colors(self) -> tuple[QColor, QColor]:
        colors = self.palette_colors
        if self._state == ERROR:
            return QColor(colors.danger), QColor(colors.danger).lighter(140)
        if self._state == LISTENING:
            return QColor(colors.secondary), QColor(colors.accent_soft)
        if self._state == THINKING:
            return QColor(colors.accent), QColor(colors.secondary)
        if self._state == SPEAKING:
            return QColor(colors.accent_soft), QColor(colors.secondary)
        return QColor(colors.accent), QColor(colors.accent_soft)

    # ------------------------------------------------------------- painting

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        side = min(self.width(), self.height())
        if side <= 0:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        centre = QPointF(self.width() / 2, self.height() / 2)
        breathe = 1.0 + 0.035 * math.sin(self._phase * 1.6)
        radius = side * 0.26 * breathe * (1.0 + 0.09 * self._smoothed)
        primary, secondary = self._state_colors()

        self._draw_halo(painter, centre, radius, primary)
        self._draw_spikes(painter, centre, radius, secondary)
        self._draw_rings(painter, centre, radius, primary, secondary)
        self._draw_core(painter, centre, radius, primary, secondary)
        painter.end()

    def _draw_halo(self, painter: QPainter, centre: QPointF, radius: float, color: QColor) -> None:
        # The gradient must reach zero alpha before the widget edge, otherwise
        # the halo clips into a visible rectangle.
        room = min(centre.x(), centre.y(), self.width() - centre.x(), self.height() - centre.y())
        glow_radius = min(radius * (2.7 + 0.5 * self._smoothed), room)
        gradient = QRadialGradient(centre, glow_radius)
        inner = QColor(color)
        inner.setAlpha(int(96 + 70 * self._smoothed))
        middle = QColor(color)
        middle.setAlpha(int(34 + 26 * self._smoothed))
        outer = QColor(color)
        outer.setAlpha(0)
        gradient.setColorAt(0.0, inner)
        gradient.setColorAt(0.35, middle)
        gradient.setColorAt(1.0, outer)
        painter.setPen(Qt.NoPen)
        painter.setBrush(gradient)
        painter.drawEllipse(centre, glow_radius, glow_radius)

    def _draw_spikes(self, painter: QPainter, centre: QPointF, radius: float, color: QColor) -> None:
        """The circular waveform that surrounds the orb while it is active."""
        if self._smoothed < 0.015:
            return
        pen = QPen(color)
        pen.setCapStyle(Qt.RoundCap)
        base = radius * 1.16
        history = list(self._history)
        for index in range(SPIKES):
            angle = (index / SPIKES) * math.tau
            wobble = math.sin(self._phase * 3.4 + self._noise[index]) * 0.5 + 0.5
            sampled = history[index % len(history)]
            amplitude = radius * 0.42 * self._smoothed * (0.35 + 0.65 * wobble) * (0.5 + sampled)
            inner_x = centre.x() + math.cos(angle) * base
            inner_y = centre.y() + math.sin(angle) * base
            outer_x = centre.x() + math.cos(angle) * (base + amplitude)
            outer_y = centre.y() + math.sin(angle) * (base + amplitude)
            line_color = QColor(color)
            line_color.setAlphaF(min(1.0, 0.18 + 0.6 * self._smoothed))
            pen.setColor(line_color)
            pen.setWidthF(max(1.0, radius * 0.012))
            painter.setPen(pen)
            painter.drawLine(QPointF(inner_x, inner_y), QPointF(outer_x, outer_y))

    def _draw_rings(
        self, painter: QPainter, centre: QPointF, radius: float, primary: QColor, secondary: QColor
    ) -> None:
        painter.setBrush(Qt.NoBrush)
        rings = [
            (1.42, 1.0, 210, primary, 0.55),
            (1.62, -0.62, 130, secondary, 0.4),
            (1.86, 0.38, 90, primary, 0.28),
        ]
        for scale, direction, span, color, alpha in rings:
            ring_radius = radius * scale
            box = QRectF(
                centre.x() - ring_radius,
                centre.y() - ring_radius,
                ring_radius * 2,
                ring_radius * 2,
            )
            gradient = QConicalGradient(centre, math.degrees(self._spin * direction) % 360)
            bright = QColor(color)
            bright.setAlphaF(alpha * (0.6 + 0.4 * self._smoothed))
            faded = QColor(color)
            faded.setAlpha(0)
            gradient.setColorAt(0.0, bright)
            gradient.setColorAt(0.28, faded)
            gradient.setColorAt(1.0, bright)
            pen = QPen(gradient, max(1.2, radius * 0.028))
            pen.setCapStyle(Qt.RoundCap)
            painter.setPen(pen)
            start = int((math.degrees(self._spin * direction) % 360) * 16)
            painter.drawArc(box, start, span * 16)

    def _draw_core(
        self, painter: QPainter, centre: QPointF, radius: float, primary: QColor, secondary: QColor
    ) -> None:
        highlight = QPointF(centre.x() - radius * 0.3, centre.y() - radius * 0.34)
        gradient = QRadialGradient(highlight, radius * 1.7)
        top = QColor(secondary).lighter(135)
        top.setAlpha(245)
        middle = QColor(primary)
        middle.setAlpha(220)
        edge = QColor(self.palette_colors.deep)
        edge.setAlpha(235)
        gradient.setColorAt(0.0, top)
        gradient.setColorAt(0.42, middle)
        gradient.setColorAt(1.0, edge)
        painter.setPen(Qt.NoPen)
        painter.setBrush(gradient)
        painter.drawEllipse(centre, radius, radius)

        # A thin rim keeps the sphere from dissolving into the background.
        rim = QColor(secondary)
        rim.setAlphaF(0.55)
        painter.setBrush(Qt.NoBrush)
        painter.setPen(QPen(rim, max(1.0, radius * 0.016)))
        painter.drawEllipse(centre, radius, radius)

        # Inner shimmer.
        shimmer = QRadialGradient(highlight, radius * 0.75)
        spot = QColor(255, 255, 255, int(70 + 60 * self._smoothed))
        clear = QColor(255, 255, 255, 0)
        shimmer.setColorAt(0.0, spot)
        shimmer.setColorAt(1.0, clear)
        painter.setPen(Qt.NoPen)
        painter.setBrush(shimmer)
        painter.drawEllipse(highlight, radius * 0.62, radius * 0.62)
