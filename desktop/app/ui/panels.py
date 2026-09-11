"""HUD framing: bracketed panels, the month strip and the throughput graph."""

from __future__ import annotations

import calendar
from collections import deque
from datetime import datetime

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer
from PySide6.QtGui import (
    QColor,
    QFont,
    QLinearGradient,
    QPainter,
    QPen,
    QPixmap,
    QPolygonF,
)
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

        # Glass: a translucent pane, lit from its top edge, with the sky
        # showing faintly through it.
        body = QLinearGradient(rect.topLeft(), rect.bottomLeft())
        top = QColor(colors.panel_alt)
        top.setAlpha(150)
        bottom = QColor(colors.panel)
        bottom.setAlpha(96)
        body.setColorAt(0.0, top)
        body.setColorAt(1.0, bottom)
        painter.setPen(Qt.NoPen)
        painter.setBrush(body)
        painter.drawRoundedRect(rect, 10, 10)

        # A sheen across the top few pixels sells the pane as glass.
        sheen_rect = QRectF(rect.left(), rect.top(), rect.width(), min(26.0, rect.height() / 2))
        sheen = QLinearGradient(sheen_rect.topLeft(), sheen_rect.bottomLeft())
        lit = QColor(colors.accent_soft)
        lit.setAlpha(30)
        clear = QColor(colors.accent_soft)
        clear.setAlpha(0)
        sheen.setColorAt(0.0, lit)
        sheen.setColorAt(1.0, clear)
        painter.setBrush(sheen)
        painter.drawRoundedRect(sheen_rect, 10, 10)

        edge = QColor(colors.border)
        edge.setAlpha(210)
        painter.setPen(QPen(edge, 1))
        painter.setBrush(Qt.NoBrush)
        painter.drawRoundedRect(rect, 10, 10)

        # A fixed highlight along the top edge, brightest near the title.
        glint_x = rect.left() + rect.width() * 0.28
        glint = QLinearGradient(glint_x - 90, 0, glint_x + 90, 0)
        edge_lit = QColor(colors.accent_soft)
        edge_lit.setAlpha(150)
        edge_clear = QColor(colors.accent_soft)
        edge_clear.setAlpha(0)
        glint.setColorAt(0.0, edge_clear)
        glint.setColorAt(0.5, edge_lit)
        glint.setColorAt(1.0, edge_clear)
        painter.setPen(QPen(glint, 1.4))
        painter.drawLine(
            QPointF(rect.left() + 10, rect.top() + 0.5),
            QPointF(rect.right() - 10, rect.top() + 0.5),
        )

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


class ScanlineOverlay(QWidget):
    """A projected-image feel: fine scanlines and one slow sweep down the glass.

    The static lines are painted once into a tile and blitted, so this costs
    almost nothing per frame despite covering the whole window.
    """

    LINE_SPACING = 3

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._tile: QPixmap | None = None
        self._sweep = 0.0
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WA_NoSystemBackground, True)

        # A full-window overlay is expensive to repaint, and the sweep is slow
        # enough that ten frames a second is indistinguishable from thirty.
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._advance)
        self._timer.start(100)

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self._tile = None
        self.update()

    def _band_rect(self) -> QRectF:
        height = max(90.0, self.height() * 0.16)
        return QRectF(0, self._sweep * self.height() - height, self.width(), height)

    def _advance(self) -> None:
        previous = self._band_rect()
        self._sweep += 0.007
        if self._sweep > 1.4:
            self._sweep = -0.25
        # Repaint only the band. This widget covers the window, and a full
        # update would drag every panel and the orb beneath it into the repaint.
        damaged = previous.united(self._band_rect()).toAlignedRect()
        self.update(damaged.adjusted(-2, -2, 2, 2))

    def _build_tile(self) -> QPixmap:
        tile = QPixmap(8, self.LINE_SPACING)
        tile.fill(Qt.transparent)
        painter = QPainter(tile)
        line = QColor(0, 0, 0, 34)
        painter.setPen(QPen(line, 1))
        painter.drawLine(0, 0, 8, 0)
        painter.end()
        return tile

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        if self.width() <= 0 or self.height() <= 0:
            return
        painter = QPainter(self)
        if self._tile is None:
            self._tile = self._build_tile()
        painter.drawTiledPixmap(self.rect(), self._tile)

        # One soft band travelling down, like a projector refreshing.
        band = self._band_rect()
        top = band.top()
        band_height = band.height()
        gradient = QLinearGradient(0, top, 0, top + band_height)
        glow = QColor(self.palette_colors.accent_soft)
        glow.setAlpha(16)
        clear = QColor(self.palette_colors.accent_soft)
        clear.setAlpha(0)
        gradient.setColorAt(0.0, clear)
        gradient.setColorAt(0.5, glow)
        gradient.setColorAt(1.0, clear)
        painter.setPen(Qt.NoPen)
        painter.setBrush(gradient)
        painter.drawRect(QRectF(0, top, self.width(), band_height))
        painter.end()


class TelemetryTicker(QWidget):
    """A single line of scrolling readouts along the foot of the window."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._segments: list[str] = ["SYSTEM READY"]
        self._offset = 0.0
        self.setFixedHeight(18)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._advance)
        self._timer.start(55)

    def set_segments(self, segments: list[str]) -> None:
        self._segments = [s for s in segments if s] or ["SYSTEM READY"]

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        self.update()

    def _advance(self) -> None:
        self._offset += 0.85
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt naming
        if self.width() <= 0:
            return
        painter = QPainter(self)
        font = QFont("Consolas, monospace")
        font.setPointSizeF(8.0)
        font.setStyleHint(QFont.Monospace)
        painter.setFont(font)

        text = "     ·     ".join(self._segments) + "     ·     "
        metrics = painter.fontMetrics()
        span = max(1, metrics.horizontalAdvance(text))
        self._offset %= span

        color = QColor(self.palette_colors.text_dim)
        color.setAlpha(150)
        painter.setPen(color)
        x = -self._offset
        while x < self.width():
            painter.drawText(QPointF(x, self.height() - 5), text)
            x += span
        painter.end()
