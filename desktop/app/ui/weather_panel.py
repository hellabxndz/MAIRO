"""The weather panel and the thread that keeps it current.

The fetch runs off the interface thread, so a slow network never freezes the
window. When a fetch fails the panel says why instead of showing stale or
invented numbers.
"""

from __future__ import annotations

from typing import Any

from PySide6.QtCore import Qt, QThread, QTimer, Signal
from PySide6.QtWidgets import QGridLayout, QHBoxLayout, QLabel, QWidget

from app.ui.panels import HudPanel
from app.ui.theme import Palette
from app.utils.errors import MairoError
from app.utils.logging_setup import get_logger
from app.utils.weather import WeatherReport, WeatherService

log = get_logger("ui.weather")

REFRESH_MINUTES = 15
FORECAST_ROWS = 3


class WeatherWorker(QThread):
    """One fetch, off the interface thread."""

    loaded = Signal(object)  # WeatherReport
    failed = Signal(str)

    def __init__(self, service: WeatherService, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.service = service

    def run(self) -> None:  # noqa: D401 - Qt entry point
        try:
            self.loaded.emit(self.service.fetch())
        except MairoError as exc:
            self.failed.emit(exc.display())
        except Exception as exc:  # never take the window down over the weather
            log.warning("Weather fetch failed unexpectedly: %s", exc)
            self.failed.emit("The weather could not be read.")


class WeatherPanel(HudPanel):
    """Current conditions for the user's city, plus the next few days."""

    def __init__(self, settings: Any, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(palette, "Weather", parent)
        self.settings = settings
        self.service = WeatherService(settings)
        self._worker: WeatherWorker | None = None

        self.place_label = QLabel()
        self.body.addWidget(self.place_label)

        headline = QHBoxLayout()
        headline.setSpacing(10)
        self.glyph_label = QLabel("•")
        self.glyph_label.setAlignment(Qt.AlignCenter)
        self.temperature_label = QLabel("—")
        headline.addWidget(self.glyph_label)
        headline.addWidget(self.temperature_label, 1)
        self.body.addLayout(headline)

        self.condition_label = QLabel()
        self.condition_label.setWordWrap(True)
        self.body.addWidget(self.condition_label)

        self.detail_label = QLabel()
        self.detail_label.setWordWrap(True)
        self.body.addWidget(self.detail_label)

        self.forecast_grid = QGridLayout()
        self.forecast_grid.setHorizontalSpacing(8)
        self.forecast_grid.setVerticalSpacing(4)
        self._forecast_labels: list[tuple[QLabel, QLabel, QLabel]] = []
        for row in range(FORECAST_ROWS):
            day = QLabel()
            glyph = QLabel()
            glyph.setAlignment(Qt.AlignCenter)
            temperatures = QLabel()
            temperatures.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
            self.forecast_grid.addWidget(day, row, 0)
            self.forecast_grid.addWidget(glyph, row, 1)
            self.forecast_grid.addWidget(temperatures, row, 2)
            self._forecast_labels.append((day, glyph, temperatures))
        self.body.addLayout(self.forecast_grid)

        self.apply_palette(palette)
        self._show_idle_message()

        self._timer = QTimer(self)
        self._timer.timeout.connect(self.refresh)
        self._timer.start(REFRESH_MINUTES * 60_000)

    # -------------------------------------------------------------- fetching

    def refresh(self) -> None:
        """Start a fetch, unless one is already running or there is nothing to fetch."""
        if not self.settings.weather_enabled:
            self._set_message("Weather is switched off in Settings.")
            return
        if not self.settings.weather_location.strip():
            self._show_idle_message()
            return
        if self._worker is not None and self._worker.isRunning():
            return
        worker = WeatherWorker(self.service, self)
        worker.loaded.connect(self._on_loaded)
        worker.failed.connect(self._on_failed)
        worker.finished.connect(worker.deleteLater)
        self._worker = worker
        worker.start()

    def location_changed(self) -> None:
        """Called after Settings closes, so a new city takes effect at once."""
        self.service.clear_cache()
        self.refresh()

    def _on_loaded(self, report: WeatherReport) -> None:
        palette = self.palette_colors
        self.place_label.setText(report.location)
        self.glyph_label.setText(report.glyph)
        self.temperature_label.setText(report.temperature_text())
        self.condition_label.setText(report.condition)

        details = []
        if report.feels_like is not None:
            details.append(f"Feels {round(report.feels_like)}°")
        if report.humidity is not None:
            details.append(f"{round(report.humidity)}% humidity")
        if report.wind is not None:
            details.append(f"{round(report.wind)} {report.wind_unit}")
        self.detail_label.setText(" · ".join(details))
        self.detail_label.setStyleSheet(f"color: {palette.text_dim}; font-size: 11px;")
        self._set_headline_visible(True)

        upcoming = report.days[1 : FORECAST_ROWS + 1]
        for index, (day_label, glyph_label, temperature_label) in enumerate(self._forecast_labels):
            if index < len(upcoming):
                day = upcoming[index]
                day_label.setText(day.label)
                glyph_label.setText(day.glyph)
                if day.high is not None and day.low is not None:
                    temperature_label.setText(
                        f"{round(day.high)}° / {round(day.low)}°"
                    )
                else:
                    temperature_label.setText("—")
            else:
                day_label.setText("")
                glyph_label.setText("")
                temperature_label.setText("")
        self._set_forecast_visible(True)

    def _on_failed(self, message: str) -> None:
        self._set_message(message)

    # -------------------------------------------------------------- display

    def _show_idle_message(self) -> None:
        self._set_message("Set your city under Settings › Application to see the weather.")

    def _set_message(self, message: str) -> None:
        """Show why there is no reading, with no stale numbers left behind."""
        self.place_label.setText("")
        self.glyph_label.setText("")
        self.temperature_label.setText("")
        self.condition_label.setText(message)
        self.detail_label.setText("")
        self._set_headline_visible(False)
        self._set_forecast_visible(False)

    def _set_headline_visible(self, visible: bool) -> None:
        for label in (self.place_label, self.glyph_label, self.temperature_label):
            label.setVisible(visible)

    def _set_forecast_visible(self, visible: bool) -> None:
        for labels in self._forecast_labels:
            for label in labels:
                label.setVisible(visible)

    def apply_palette(self, palette: Palette) -> None:
        super().apply_palette(palette)
        if not hasattr(self, "place_label"):
            return  # called from HudPanel.__init__ before the widgets exist
        self.place_label.setStyleSheet(
            f"color: {palette.text_dim}; font-size: 11px; letter-spacing: 1px;"
        )
        self.glyph_label.setStyleSheet(f"color: {palette.secondary}; font-size: 26px;")
        self.temperature_label.setStyleSheet(
            f"color: {palette.text}; font-size: 27px; font-weight: 600;"
        )
        self.condition_label.setStyleSheet(f"color: {palette.text}; font-size: 12px;")
        self.detail_label.setStyleSheet(f"color: {palette.text_dim}; font-size: 11px;")
        for day_label, glyph_label, temperature_label in self._forecast_labels:
            day_label.setStyleSheet(f"color: {palette.text_dim}; font-size: 11px;")
            glyph_label.setStyleSheet(f"color: {palette.secondary}; font-size: 13px;")
            temperature_label.setStyleSheet(f"color: {palette.text}; font-size: 11px;")
