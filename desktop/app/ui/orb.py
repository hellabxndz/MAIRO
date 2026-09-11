"""The core at the centre of the window: a sphere made of light.

Rather than a solid ball, the orb is a few thousand points arranged on a
sphere, rotated and projected every frame. Speaking pushes a shockwave
through them; listening makes them bloom with your voice; thinking spins the
shell and draws it tight. The maths runs in numpy so the point count can be
high without costing the frame rate.
"""

from __future__ import annotations

import math

import numpy as np
from PySide6.QtCore import QPointF, QRectF, Qt, QTimer
from PySide6.QtGui import (
    QColor,
    QConicalGradient,
    QPainter,
    QPen,
    QPixmap,
    QPolygonF,
    QRadialGradient,
)
from PySide6.QtWidgets import QSizePolicy, QWidget

from app.ui.theme import Palette

FRAME_MS = 33
IDLE_FRAME_MS = 66  # a resting breath does not need a full frame rate
PARTICLES = 900
DEPTH_BUCKETS = 5  # one pen change per bucket keeps the draw cheap
PERSPECTIVE = 3.2

READY = "ready"
LISTENING = "listening"
THINKING = "thinking"
SPEAKING = "speaking"
ERROR = "error"


def _fibonacci_sphere(count: int) -> np.ndarray:
    """Evenly spread points over a unit sphere."""
    indices = np.arange(count, dtype=np.float32) + 0.5
    phi = np.arccos(1 - 2 * indices / count)
    theta = np.pi * (1 + 5**0.5) * indices
    return np.stack(
        [np.cos(theta) * np.sin(phi), np.sin(theta) * np.sin(phi), np.cos(phi)], axis=1
    ).astype(np.float32)


class OrbWidget(QWidget):
    """An animated sphere of particles that shows what the assistant is doing."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._state = READY
        self._phase = 0.0
        self._spin = 0.0
        self._level = 0.0
        self._smoothed = 0.0
        self._shockwave = -1.0  # < 0 means no wave travelling
        self._halo: QPixmap | None = None
        self._halo_key: tuple | None = None

        self._points = _fibonacci_sphere(PARTICLES)
        # Per-point ripple offsets, so the shell breathes unevenly.
        rng = np.random.default_rng(11)
        self._noise = rng.uniform(0, math.tau, PARTICLES).astype(np.float32)
        self._twinkle = rng.uniform(0.55, 1.0, PARTICLES).astype(np.float32)
        self._latitude = self._points[:, 1].copy()

        self.setMinimumSize(240, 240)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._advance)
        self._timer.start(IDLE_FRAME_MS)

    # --------------------------------------------------------------- state

    @property
    def state(self) -> str:
        return self._state

    def set_state(self, state: str) -> None:
        if state == self._state:
            return
        # Entering speech throws a wave out through the shell.
        if state == SPEAKING:
            self._shockwave = 0.0
        if state != LISTENING:
            self._level = 0.0
        self._state = state
        resting = state in (READY, ERROR)
        self._timer.setInterval(IDLE_FRAME_MS if resting else FRAME_MS)
        self.update()

    def set_level(self, level: float) -> None:
        """Feed the live microphone level, 0.0 to roughly 1.0."""
        self._level = max(0.0, min(1.0, level * 6.0))

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self._halo_key = None
        self.update()

    # ----------------------------------------------------------- animation

    def _advance(self) -> None:
        step = self._timer.interval() / 1000.0
        self._phase += step
        speed = {THINKING: 0.85, SPEAKING: 0.5, LISTENING: 0.3}.get(self._state, 0.12)
        self._spin += step * speed

        if self._state == SPEAKING:
            target = 0.34 + 0.22 * abs(math.sin(self._phase * 5.1))
            if self._shockwave >= 0:
                self._shockwave += step * 1.9
                if self._shockwave > 2.2:
                    self._shockwave = 0.0  # keep pulsing while it talks
        elif self._state == LISTENING:
            target = self._level
        elif self._state == THINKING:
            target = 0.24 + 0.09 * math.sin(self._phase * 3.0)
        else:
            target = 0.0
            self._shockwave = -1.0

        self._smoothed += (target - self._smoothed) * 0.22
        self.update()

    # ------------------------------------------------------------ colours

    def _state_colors(self) -> tuple[QColor, QColor]:
        colors = self.palette_colors
        if self._state == ERROR:
            return QColor(colors.danger), QColor(colors.danger).lighter(150)
        if self._state == LISTENING:
            return QColor(colors.secondary), QColor(colors.accent_soft)
        if self._state == THINKING:
            return QColor(colors.accent), QColor(colors.secondary)
        if self._state == SPEAKING:
            return QColor(colors.accent_soft), QColor(colors.secondary)
        return QColor(colors.accent), QColor(colors.accent_soft)

    # ----------------------------------------------------------- geometry

    def _projected(self, radius: float):
        """Rotate the shell, ripple it, and flatten it to the screen."""
        points = self._points
        level = self._smoothed

        # Radial displacement: a slow breath, a per-point ripple, and the
        # travelling wave that speech sets off.
        ripple = np.sin(self._noise + self._phase * 2.6).astype(np.float32)
        scale = 1.0 + 0.05 * ripple + 0.16 * level * ripple
        if self._shockwave >= 0:
            band = np.exp(-((self._latitude + 1.0 - self._shockwave) ** 2) * 9.0)
            scale = scale + (0.22 * band).astype(np.float32)

        moved = points * scale[:, None]

        yaw, pitch = self._spin, self._spin * 0.34
        cos_y, sin_y = math.cos(yaw), math.sin(yaw)
        cos_p, sin_p = math.cos(pitch), math.sin(pitch)

        x = moved[:, 0] * cos_y + moved[:, 2] * sin_y
        z0 = -moved[:, 0] * sin_y + moved[:, 2] * cos_y
        y = moved[:, 1] * cos_p - z0 * sin_p
        z = moved[:, 1] * sin_p + z0 * cos_p

        depth = PERSPECTIVE / (PERSPECTIVE - z)
        return x * depth * radius, y * depth * radius, z, depth

    # ------------------------------------------------------------ painting

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        side = min(self.width(), self.height())
        if side <= 0:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        centre = QPointF(self.width() / 2, self.height() / 2)
        radius = side * 0.23 * (1.0 + 0.08 * self._smoothed)
        primary, secondary = self._state_colors()

        self._draw_halo(painter, centre, radius, primary)
        self._draw_rings(painter, centre, radius, primary, secondary)
        self._draw_particles(painter, centre, radius, primary, secondary)
        painter.end()

    def _draw_halo(self, painter: QPainter, centre: QPointF, radius: float, color: QColor) -> None:
        """Blit the glow from a cache.

        Two large radial gradients are the most expensive thing here and they
        only change when the level or the colour does, so they are rendered
        into a pixmap and reused until one of those moves.
        """
        room = min(centre.x(), centre.y(), self.width() - centre.x(), self.height() - centre.y())
        glow = min(radius * (2.6 + 0.6 * self._smoothed), room)
        if glow <= 1:
            return

        key = (int(glow), int(radius), color.rgb(), int(self._smoothed * 16))
        if key != self._halo_key or self._halo is None:
            self._halo_key = key
            size = int(glow * 2) + 2
            pixmap = QPixmap(size, size)
            pixmap.fill(Qt.transparent)
            local = QPointF(size / 2, size / 2)
            cache_painter = QPainter(pixmap)
            cache_painter.setRenderHint(QPainter.Antialiasing, True)
            cache_painter.setPen(Qt.NoPen)

            gradient = QRadialGradient(local, glow)
            inner = QColor(color)
            inner.setAlpha(int(84 + 74 * self._smoothed))
            middle = QColor(color)
            middle.setAlpha(int(26 + 24 * self._smoothed))
            outer = QColor(color)
            outer.setAlpha(0)
            gradient.setColorAt(0.0, inner)
            gradient.setColorAt(0.38, middle)
            gradient.setColorAt(1.0, outer)
            cache_painter.setBrush(gradient)
            cache_painter.drawEllipse(local, glow, glow)

            # A dense bright centre so the shell reads as solid at its core.
            core = QRadialGradient(local, radius * 0.62)
            hot = QColor(color).lighter(165)
            hot.setAlpha(int(96 + 80 * self._smoothed))
            fade = QColor(color)
            fade.setAlpha(0)
            core.setColorAt(0.0, hot)
            core.setColorAt(0.55, QColor(color.red(), color.green(), color.blue(), 40))
            core.setColorAt(1.0, fade)
            cache_painter.setBrush(core)
            cache_painter.drawEllipse(local, radius * 0.62, radius * 0.62)
            cache_painter.end()
            self._halo = pixmap

        painter.drawPixmap(
            QPointF(centre.x() - self._halo.width() / 2, centre.y() - self._halo.height() / 2),
            self._halo,
        )

    def _draw_rings(
        self, painter: QPainter, centre: QPointF, radius: float, primary: QColor, secondary: QColor
    ) -> None:
        painter.setBrush(Qt.NoBrush)
        for scale, direction, span, color, alpha in (
            (1.5, 1.0, 200, primary, 0.5),
            (1.72, -0.6, 120, secondary, 0.34),
        ):
            ring = radius * scale
            box = QRectF(centre.x() - ring, centre.y() - ring, ring * 2, ring * 2)
            gradient = QConicalGradient(centre, math.degrees(self._spin * direction) % 360)
            bright = QColor(color)
            bright.setAlphaF(alpha * (0.55 + 0.45 * self._smoothed))
            clear = QColor(color)
            clear.setAlpha(0)
            gradient.setColorAt(0.0, bright)
            gradient.setColorAt(0.3, clear)
            gradient.setColorAt(1.0, bright)
            pen = QPen(gradient, max(1.0, radius * 0.02))
            pen.setCapStyle(Qt.RoundCap)
            painter.setPen(pen)
            painter.drawArc(box, int((math.degrees(self._spin * direction) % 360) * 16), span * 16)

    def _draw_particles(
        self, painter: QPainter, centre: QPointF, radius: float, primary: QColor, secondary: QColor
    ) -> None:
        x, y, z, depth = self._projected(radius)
        # Two cues combined: nearer points read brighter, and so does the limb,
        # where the line of sight passes through the most shell. Together they
        # make a cloud of dots read as a sphere rather than a haze.
        # The ripple can push a point beyond the unit sphere, so both cues are
        # clamped: a negative limb raised to a fractional power is undefined and
        # would poison the whole brightness array with NaN.
        nearness = np.clip((z + 1.0) * 0.5, 0.0, 1.0)
        limb = np.clip(1.0 - np.abs(z), 0.0, 1.0)
        twinkle = self._twinkle * (0.82 + 0.18 * np.sin(self._phase * 3.1 + self._noise))
        brightness = np.clip((0.45 * nearness + 0.55 * limb**1.5) * twinkle, 0.0, 1.0)

        buckets = np.clip((brightness * DEPTH_BUCKETS).astype(np.int32), 0, DEPTH_BUCKETS - 1)
        order = np.argsort(buckets)  # draw far points first
        cx, cy = centre.x(), centre.y()

        for bucket in range(DEPTH_BUCKETS):
            selected = order[buckets[order] == bucket]
            if selected.size == 0:
                continue
            weight = (bucket + 0.5) / DEPTH_BUCKETS
            color = QColor(
                int(primary.red() + (secondary.red() - primary.red()) * weight),
                int(primary.green() + (secondary.green() - primary.green()) * weight),
                int(primary.blue() + (secondary.blue() - primary.blue()) * weight),
            )
            color.setAlphaF(0.16 + 0.8 * weight)
            pen = QPen(color)
            pen.setWidthF(max(1.0, radius * (0.012 + 0.028 * weight) * (1 + 0.5 * self._smoothed)))
            pen.setCapStyle(Qt.RoundCap)
            painter.setPen(pen)

            polygon = QPolygonF()
            for index in selected:
                polygon.append(QPointF(cx + float(x[index]), cy + float(y[index])))
            painter.drawPoints(polygon)
