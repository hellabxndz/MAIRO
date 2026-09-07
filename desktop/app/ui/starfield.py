"""The space backdrop: drifting stars over soft nebula clouds.

Stars are generated once and drawn each frame; the nebula is painted into a
cached pixmap that is only rebuilt when the widget resizes, which keeps the
animation cheap enough to run continuously.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from PySide6.QtCore import QPointF, Qt, QTimer
from PySide6.QtGui import QColor, QPainter, QPixmap, QRadialGradient
from PySide6.QtWidgets import QWidget

from app.ui.theme import Palette

STAR_COUNT = 190
FRAME_MS = 40


@dataclass
class Star:
    x: float
    y: float
    size: float
    brightness: float
    drift: float
    twinkle_phase: float
    twinkle_speed: float


class Starfield(QWidget):
    """A slow, quiet galaxy field used as the window background."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._stars: list[Star] = []
        self._nebula: QPixmap | None = None
        self._tick = 0.0
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        random.seed(7)  # a stable sky between runs
        self._generate_stars()

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._advance)
        self._timer.start(FRAME_MS)

    # ------------------------------------------------------------ content

    def _generate_stars(self) -> None:
        self._stars = [
            Star(
                x=random.random(),
                y=random.random(),
                size=random.uniform(0.6, 2.1),
                brightness=random.uniform(0.25, 1.0),
                drift=random.uniform(0.004, 0.02),
                twinkle_phase=random.uniform(0, math.tau),
                twinkle_speed=random.uniform(0.6, 2.4),
            )
            for _ in range(STAR_COUNT)
        ]

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self._nebula = None
        self.update()

    def _advance(self) -> None:
        self._tick += FRAME_MS / 1000.0
        for star in self._stars:
            star.x -= star.drift * (FRAME_MS / 1000.0) * 0.35
            if star.x < -0.02:
                star.x = 1.02
                star.y = random.random()
        self.update()

    # ------------------------------------------------------------ painting

    def resizeEvent(self, event) -> None:  # noqa: N802 - Qt naming
        self._nebula = None
        super().resizeEvent(event)

    def _build_nebula(self) -> QPixmap:
        colors = self.palette_colors
        pixmap = QPixmap(self.size())
        pixmap.fill(QColor(colors.deep))
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.Antialiasing, True)
        width, height = self.width(), self.height()

        clouds = [
            (0.22, 0.28, 0.75, QColor(colors.accent), 34),
            (0.82, 0.20, 0.60, QColor(colors.secondary), 22),
            (0.62, 0.88, 0.85, QColor(colors.accent), 24),
            (0.05, 0.85, 0.55, QColor(colors.secondary), 16),
        ]
        for fx, fy, spread, color, alpha in clouds:
            centre = QPointF(width * fx, height * fy)
            radius = max(width, height) * spread
            gradient = QRadialGradient(centre, radius)
            near = QColor(color)
            near.setAlpha(alpha)
            mid = QColor(color)
            mid.setAlpha(int(alpha * 0.35))
            far = QColor(color)
            far.setAlpha(0)
            gradient.setColorAt(0.0, near)
            gradient.setColorAt(0.45, mid)
            gradient.setColorAt(1.0, far)
            painter.setBrush(gradient)
            painter.setPen(Qt.NoPen)
            painter.drawEllipse(centre, radius, radius)

        # A darker vignette keeps the centre of the window readable.
        vignette = QRadialGradient(QPointF(width / 2, height / 2), max(width, height) * 0.75)
        transparent = QColor(colors.deep)
        transparent.setAlpha(0)
        edge = QColor(colors.deep)
        edge.setAlpha(190)
        vignette.setColorAt(0.35, transparent)
        vignette.setColorAt(1.0, edge)
        painter.setBrush(vignette)
        painter.drawRect(0, 0, width, height)
        painter.end()
        return pixmap

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        if self.width() <= 0 or self.height() <= 0:
            return
        if self._nebula is None or self._nebula.size() != self.size():
            self._nebula = self._build_nebula()

        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        painter.drawPixmap(0, 0, self._nebula)

        base = QColor(self.palette_colors.text)
        painter.setPen(Qt.NoPen)
        for star in self._stars:
            twinkle = 0.65 + 0.35 * math.sin(self._tick * star.twinkle_speed + star.twinkle_phase)
            color = QColor(base)
            color.setAlphaF(max(0.0, min(1.0, star.brightness * twinkle * 0.9)))
            painter.setBrush(color)
            radius = star.size * (0.85 + 0.25 * twinkle)
            painter.drawEllipse(
                QPointF(star.x * self.width(), star.y * self.height()), radius, radius
            )
        painter.end()
