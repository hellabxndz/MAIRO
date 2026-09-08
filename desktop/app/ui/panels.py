"""HUD framing: bracketed panels, the month strip and the throughput graph."""

from __future__ import annotations

import calendar
from collections import deque
from datetime import datetime

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer
from PySide6.QtGui import QColor, QFont, QPainter, QPen, QPolygonF
from PySide6.QtWidgets import QLabel, QSizePolicy, QVBoxLayout, QWidget

from app.ui.theme import Palette


class HudPanel(QWidget):
    """A titled box with cut corners, holding any layout you give it."""

    def __init__(self, palette: Palette, title: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self.title = title

        self._title_label = QLabel(title.upper())
        self._title_label.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(12, 8, 12, 10)
        outer.setSpacing(7)
        if title:
            outer.addWidget(self._title_label)

        self.body = QVBoxLayout()
        self.body.setContentsMargins(0, 0, 0, 0)
        self.body.setSpacing(7)
        outer.addLayout(self.body)

        self.apply_palette(palette)

    def apply_palette(self, palette: Palette) -> None:
        self.palette_colors = palette
        self._title_label.setStyleSheet(
            f"color: {palette.text_dim}; font-size: 10px; font-weight: 700; letter-spacing: 3px;"
        )
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        colors = self.palette_colors
        rect = QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5)

        background = QColor(colors.panel)
        background.setAlpha(165)  # the starfield stays faintly visible behind
        painter.setPen(Qt.NoPen)
        painter.setBrush(background)
        painter.drawRoundedRect(rect, 10, 10)

        edge = QColor(colors.border)
        edge.setAlpha(190)
        painter.setPen(QPen(edge, 1))
        painter.setBrush(Qt.NoBrush)
        painter.drawRoundedRect(rect, 10, 10)

        # Corner brackets, the detail that makes it read as an instrument panel.
        bracket = QColor(colors.accent)
        bracket.setAlphaF(0.8)
        painter.setPen(QPen(bracket, 2))
        run = 16.0
        for x_edge, y_edge, x_step, y_step in (
            (rect.left(), rect.top(), 1, 1),
            (rect.right(), rect.top(), -1, 1),
            (rect.left(), rect.bottom(), 1, -1),
            (rect.right(), rect.bottom(), -1, -1),
        ):
            painter.drawLine(
                QPointF(x_edge + 9 * x_step, y_edge + 1.5 * y_step),
                QPointF(x_edge + (9 + run) * x_step, y_edge + 1.5 * y_step),
            )
            painter.drawLine(
                QPointF(x_edge + 1.5 * x_step, y_edge + 9 * y_step),
                QPointF(x_edge + 1.5 * x_step, y_edge + (9 + run) * y_step),
            )
        painter.end()


class MonthStrip(QWidget):
    """Every day of the current month, with today lit up."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self.setFixedHeight(30)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        # Refresh once a minute so the highlight moves at midnight.
        self._timer = QTimer(self)
        self._timer.timeout.connect(self.update)
        self._timer.start(60_000)

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        colors = self.palette_colors
        today = datetime.now()
        days = calendar.monthrange(today.year, today.month)[1]
        if days <= 0 or self.width() <= 0:
            return

        slot = self.width() / days
        font = QFont(self.font())
        font.setPointSizeF(8.0)
        painter.setFont(font)

        for day in range(1, days + 1):
            box = QRectF((day - 1) * slot, 4, slot, self.height() - 8)
            is_today = day == today.day
            if is_today:
                highlight = QColor(colors.accent)
                highlight.setAlpha(60)
                painter.setPen(QPen(QColor(colors.accent), 1))
                painter.setBrush(highlight)
                painter.drawRoundedRect(box.adjusted(1.5, 0, -1.5, 0), 4, 4)
                painter.setPen(QColor(colors.text))
            else:
                painter.setPen(QColor(colors.text_dim))
            painter.drawText(box, Qt.AlignCenter, f"{day:02d}")
        painter.end()


class ThroughputGraph(QWidget):
    """Scrolling download and upload history, in kilobytes per second."""

    HISTORY = 90

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._down: deque[float] = deque([0.0] * self.HISTORY, maxlen=self.HISTORY)
        self._up: deque[float] = deque([0.0] * self.HISTORY, maxlen=self.HISTORY)
        self._available = False
        self.setFixedHeight(74)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

    def add_sample(self, download_kbps: float | None, upload_kbps: float | None) -> None:
        self._available = download_kbps is not None
        self._down.append(float(download_kbps or 0.0))
        self._up.append(float(upload_kbps or 0.0))
        self.update()

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self.update()

    @staticmethod
    def _format(value: float) -> str:
        if value >= 1024:
            return f"{value / 1024:.1f} MB/s"
        return f"{value:.0f} KB/s"

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, True)
        colors = self.palette_colors
        width, height = self.width(), self.height()
        plot_top = 18.0
        plot_height = height - plot_top - 2

        font = QFont(self.font())
        font.setPointSizeF(8.0)
        painter.setFont(font)

        if not self._available:
            painter.setPen(QColor(colors.text_dim))
            painter.drawText(self.rect(), Qt.AlignCenter,
                             "Network readings need the psutil package")
            painter.end()
            return

        peak = max(max(self._down), max(self._up), 64.0)
        painter.setPen(QColor(colors.secondary))
        painter.drawText(QRectF(0, 0, width, 14), Qt.AlignLeft | Qt.AlignVCenter,
                         f"Down {self._format(self._down[-1])}")
        painter.setPen(QColor(colors.accent_soft))
        painter.drawText(QRectF(0, 0, width, 14), Qt.AlignRight | Qt.AlignVCenter,
                         f"Up {self._format(self._up[-1])}")

        baseline = QColor(colors.border)
        painter.setPen(QPen(baseline, 1, Qt.DashLine))
        painter.drawLine(QPointF(0, plot_top + plot_height), QPointF(width, plot_top + plot_height))

        for series, color in ((self._down, colors.secondary), (self._up, colors.accent_soft)):
            points = QPolygonF()
            step = width / (len(series) - 1)
            for index, value in enumerate(series):
                ratio = min(1.0, value / peak)
                points.append(QPointF(index * step, plot_top + plot_height - ratio * plot_height))
            line = QColor(color)
            line.setAlphaF(0.9)
            painter.setPen(QPen(line, 1.6))
            painter.setBrush(Qt.NoBrush)
            painter.drawPolyline(points)
        painter.end()
