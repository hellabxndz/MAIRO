"""Circular and linear readouts for the HUD.

Each gauge shows one measurement: a value in the middle, a caption underneath,
and an arc that fills as the value rises. A gauge with no reading draws a dash
rather than a guess.
"""

from __future__ import annotations

import math

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer
from PySide6.QtGui import QColor, QFont, QPainter, QPen
from PySide6.QtWidgets import QSizePolicy, QWidget

from app.ui.theme import Palette

FRAME_MS = 40
SWEEP_DEGREES = 280  # the gap at the bottom is what makes it read as a gauge
START_DEGREES = 230


class RingGauge(QWidget):
    """An arc gauge: percentage outside, free-form text in the middle."""

    def __init__(
        self,
        palette: Palette,
        caption: str = "",
        diameter: int = 108,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self.caption = caption
        self._target = 0.0
        self._shown = 0.0
        self._centre_text = "—"
        self._sub_text = ""
        self._has_reading = False
        self._spin = 0.0

        self.setFixedSize(diameter, diameter)
        self.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._advance)
        self._timer.start(FRAME_MS)

    # ------------------------------------------------------------- content

    def set_reading(self, percent: float | None, centre: str = "", sub: str = "") -> None:
        """Update the gauge. Pass None for percent when there is no reading."""
        self._has_reading = percent is not None
        self._target = max(0.0, min(100.0, float(percent))) if percent is not None else 0.0
        self._centre_text = centre if centre else ("—" if percent is None else f"{round(self._target)}%")
        self._sub_text = sub

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self.update()

    def _advance(self) -> None:
        self._spin += FRAME_MS / 1000.0
        if abs(self._target - self._shown) > 0.05:
            self._shown += (self._target - self._shown) * 0.18
            self.update()
        elif self._has_reading:
            self.update()  # keep the tick marks drifting

    # ------------------------------------------------------------- painting

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        colors = self.palette_colors
        side = min(self.width(), self.height())
        centre = QPointF(self.width() / 2, self.height() / 2)
        radius = side / 2 - 8
        box = QRectF(centre.x() - radius, centre.y() - radius, radius * 2, radius * 2)

        # Track.
        track = QColor(colors.border)
        painter.setPen(QPen(track, max(2.0, side * 0.035), Qt.SolidLine, Qt.RoundCap))
        painter.drawArc(box, int(START_DEGREES * 16), int(-SWEEP_DEGREES * 16))

        # Filled portion.
        if self._has_reading:
            fill = QColor(colors.secondary if self._shown < 80 else colors.danger)
            painter.setPen(QPen(fill, max(2.0, side * 0.035), Qt.SolidLine, Qt.RoundCap))
            span = -SWEEP_DEGREES * (self._shown / 100.0)
            painter.drawArc(box, int(START_DEGREES * 16), int(span * 16))

        # Inner tick ring, drifting slowly so the panel feels alive.
        inner = radius * 0.74
        pen = QPen(QColor(colors.accent), 1.0)
        painter.setPen(pen)
        ticks = 36
        for index in range(ticks):
            angle = self._spin * 0.25 + (index / ticks) * math.tau
            lit = (index % 3 == 0) and self._has_reading
            length = inner * (0.1 if lit else 0.05)
            color = QColor(colors.accent if lit else colors.border)
            color.setAlphaF(0.75 if lit else 0.4)
            pen.setColor(color)
            painter.setPen(pen)
            painter.drawLine(
                QPointF(centre.x() + math.cos(angle) * (inner - length),
                        centre.y() + math.sin(angle) * (inner - length)),
                QPointF(centre.x() + math.cos(angle) * inner,
                        centre.y() + math.sin(angle) * inner),
            )

        # Readings.
        painter.setPen(QColor(colors.text))
        value_font = QFont(self.font())
        value_font.setPointSizeF(max(9.0, side * 0.17))
        value_font.setBold(True)
        painter.setFont(value_font)
        text_box = QRectF(box)
        if self._sub_text:
            text_box.translate(0, -side * 0.07)
        painter.drawText(text_box, Qt.AlignCenter, self._centre_text)

        if self._sub_text:
            painter.setPen(QColor(colors.text_dim))
            sub_font = QFont(self.font())
            sub_font.setPointSizeF(max(7.0, side * 0.085))
            painter.setFont(sub_font)
            sub_box = QRectF(box)
            sub_box.translate(0, side * 0.14)
            painter.drawText(sub_box, Qt.AlignCenter, self._sub_text)

        if self.caption:
            painter.setPen(QColor(colors.text_dim))
            caption_font = QFont(self.font())
            caption_font.setPointSizeF(max(6.5, side * 0.075))
            caption_font.setBold(True)
            painter.setFont(caption_font)
            painter.drawText(
                QRectF(0, self.height() - 14, self.width(), 14),
                Qt.AlignCenter,
                self.caption.upper(),
            )
        painter.end()


class BarGauge(QWidget):
    """A labelled horizontal bar, for readings that do not need a ring."""

    def __init__(self, palette: Palette, label: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self.label = label
        self._percent: float | None = None
        self._value_text = "—"
        self.setFixedHeight(34)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

    def set_reading(self, percent: float | None, value_text: str = "") -> None:
        self._percent = None if percent is None else max(0.0, min(100.0, float(percent)))
        self._value_text = value_text or ("—" if percent is None else f"{round(percent)}%")
        self.update()

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        colors = self.palette_colors

        label_font = QFont(self.font())
        label_font.setPointSizeF(8.0)
        label_font.setBold(True)
        painter.setFont(label_font)
        painter.setPen(QColor(colors.text_dim))
        painter.drawText(QRectF(0, 0, self.width(), 14), Qt.AlignLeft | Qt.AlignVCenter,
                         self.label.upper())
        painter.setPen(QColor(colors.text))
        painter.drawText(QRectF(0, 0, self.width(), 14), Qt.AlignRight | Qt.AlignVCenter,
                         self._value_text)

        track = QRectF(0, 20, self.width(), 6)
        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor(colors.border))
        painter.drawRoundedRect(track, 3, 3)

        if self._percent is not None:
            filled = QRectF(track)
            filled.setWidth(track.width() * self._percent / 100.0)
            painter.setBrush(QColor(colors.secondary if self._percent < 90 else colors.danger))
            painter.drawRoundedRect(filled, 3, 3)
        painter.end()
