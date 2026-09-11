"""The space backdrop: stars over soft nebula clouds.

The whole sky — nebulae and stars together — is painted once into a pixmap
and then simply blitted. It does not animate, and that is the point: this
widget covers the entire window, so every frame it drew would force every
panel and the orb above it to redraw too. Measured, a drifting sky cost more
than everything else in the interface combined. The motion in this design
belongs to the orb.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from PySide6.QtCore import QPointF, Qt
from PySide6.QtGui import QColor, QPainter, QPixmap, QRadialGradient
from PySide6.QtWidgets import QWidget

from app.ui.theme import Palette

STAR_COUNT = 150


@dataclass
class Star:
    x: float
    y: float
    size: float
    brightness: float


class Starfield(QWidget):
    """A slow, quiet galaxy field used as the window background."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._stars: list[Star] = []
        self._sky: QPixmap | None = None
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        random.seed(7)  # a stable sky between runs
        self._generate_stars()

    # ------------------------------------------------------------ content

    def _generate_stars(self) -> None:
        self._stars = [
            Star(
                x=random.random(),
                y=random.random(),
                size=random.uniform(0.6, 2.1),
                brightness=random.uniform(0.25, 1.0),
            )
            for _ in range(STAR_COUNT)
        ]

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self._sky = None
        self.update()

    # ------------------------------------------------------------ painting

    def resizeEvent(self, event) -> None:  # noqa: N802 - Qt naming
        self._sky = None
        super().resizeEvent(event)

    def _build_sky(self) -> QPixmap:
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

        # The stars go into the same pixmap, so a repaint is one blit.
        base = QColor(colors.text)
        painter.setPen(Qt.NoPen)
        for star in self._stars:
            color = QColor(base)
            color.setAlphaF(max(0.0, min(1.0, star.brightness * 0.9)))
            painter.setBrush(color)
            painter.drawEllipse(
                QPointF(star.x * width, star.y * height), star.size, star.size
            )
        painter.end()
        return pixmap

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        if self.width() <= 0 or self.height() <= 0:
            return
        if self._sky is None or self._sky.size() != self.size():
            self._sky = self._build_sky()
        painter = QPainter(self)
        painter.drawPixmap(0, 0, self._sky)
        painter.end()
