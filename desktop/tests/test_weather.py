"""Weather tests against a local stand-in for Open-Meteo.

The responses below are the shapes the real service returns, so this catches
parsing mistakes without needing the network or an account.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"
os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-weather-tests-"))

from app.config.settings import Settings  # noqa: E402
from app.utils.errors import MairoError  # noqa: E402
from app.utils.weather import (  # noqa: E402
    DayForecast,
    WeatherReport,
    WeatherService,
    describe_code,
    glyph_for_code,
)

GEOCODE_BODY = {
    "results": [
        {
            "id": 2761369,
            "name": "Vienna",
            "latitude": 48.20849,
            "longitude": 16.37208,
            "country": "Austria",
            "timezone": "Europe/Vienna",
        }
    ],
    "generationtime_ms": 0.6,
}

FORECAST_BODY = {
    "latitude": 48.2,
    "longitude": 16.375,
    "timezone": "Europe/Vienna",
    "current_units": {
        "temperature_2m": "°C",
        "relative_humidity_2m": "%",
        "apparent_temperature": "°C",
        "wind_speed_10m": "km/h",
    },
    "current": {
        "time": "2026-09-08T10:00",
        "temperature_2m": 17.4,
        "relative_humidity_2m": 68,
        "apparent_temperature": 16.1,
        "is_day": 1,
        "weather_code": 61,
        "wind_speed_10m": 12.3,
    },
    "daily_units": {"temperature_2m_max": "°C"},
    "daily": {
        "time": ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"],
        "weather_code": [61, 3, 0, 95],
        "temperature_2m_max": [19.2, 21.5, 24.0, 20.1],
        "temperature_2m_min": [11.0, 12.4, 13.9, 12.2],
    },
}

STATE = {"geocode": GEOCODE_BODY, "forecast": FORECAST_BODY, "status": 200, "requests": []}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 - http.server naming
        parsed = urlparse(self.path)
        STATE["requests"].append((parsed.path, parse_qs(parsed.query)))
        body = STATE["geocode"] if "search" in parsed.path else STATE["forecast"]
        payload = json.dumps(body).encode()
        self.send_response(STATE["status"])
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


class CodeTests(unittest.TestCase):
    def test_codes_become_plain_english(self):
        self.assertEqual(describe_code(0), "Clear sky")
        self.assertEqual(describe_code(61), "Light rain")
        self.assertEqual(describe_code(95), "Thunderstorm")

    def test_an_unknown_code_does_not_crash(self):
        self.assertEqual(describe_code(1234), "Unsettled")
        self.assertEqual(describe_code(None), "Unknown conditions")

    def test_night_gets_its_own_glyph(self):
        self.assertNotEqual(glyph_for_code(0, True), glyph_for_code(0, False))


class SummaryTests(unittest.TestCase):
    def test_spoken_summary_reads_as_a_sentence(self):
        report = WeatherReport(
            location="Vienna, Austria",
            temperature=17.4,
            feels_like=13.0,
            code=61,
            days=[
                DayForecast("2026-09-08", 19.2, 11.0, 61),
                DayForecast("2026-09-09", 21.5, 12.4, 3),
            ],
        )
        spoken = report.spoken_summary()
        self.assertIn("Vienna, Austria", spoken)
        self.assertIn("17 degrees", spoken)
        self.assertIn("light rain", spoken)
        self.assertIn("feeling like 13", spoken)
        self.assertIn("Tomorrow", spoken)
        self.assertTrue(spoken.endswith("."))

    def test_summary_without_readings_says_so(self):
        report = WeatherReport(location="Nowhere")
        self.assertIn("No temperature", report.spoken_summary())

    def test_temperature_text_handles_a_missing_reading(self):
        self.assertEqual(WeatherReport(location="X").temperature_text(), "—")


class ServiceTests(unittest.TestCase):
    server = None

    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        os.environ["OPEN_METEO_GEOCODING_URL"] = f"{base}/v1/search"
        os.environ["OPEN_METEO_FORECAST_URL"] = f"{base}/v1/forecast"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        os.environ.pop("OPEN_METEO_GEOCODING_URL", None)
        os.environ.pop("OPEN_METEO_FORECAST_URL", None)

    def setUp(self):
        STATE["geocode"] = GEOCODE_BODY
        STATE["forecast"] = FORECAST_BODY
        STATE["status"] = 200
        STATE["requests"] = []
        self.settings = Settings()
        self.settings.weather_location = "Vienna"
        self.service = WeatherService(self.settings)

    def test_a_full_fetch_is_parsed(self):
        report = self.service.fetch()
        self.assertEqual(report.location, "Vienna, Austria")
        self.assertAlmostEqual(report.temperature, 17.4)
        self.assertAlmostEqual(report.feels_like, 16.1)
        self.assertEqual(report.condition, "Light rain")
        self.assertEqual(report.temperature_unit, "°C")
        self.assertEqual(len(report.days), 4)
        self.assertEqual(report.days[1].label, "Wed")
        self.assertAlmostEqual(report.days[2].high, 24.0)

    def test_the_place_is_looked_up_only_once(self):
        self.service.fetch()
        self.service.fetch()
        searches = [path for path, _ in STATE["requests"] if "search" in path]
        self.assertEqual(len(searches), 1)

    def test_clearing_the_cache_looks_the_place_up_again(self):
        self.service.fetch()
        self.service.clear_cache()
        self.service.fetch()
        searches = [path for path, _ in STATE["requests"] if "search" in path]
        self.assertEqual(len(searches), 2)

    def test_imperial_units_are_requested(self):
        self.settings.weather_units = "imperial"
        self.service.fetch()
        forecast_query = [q for path, q in STATE["requests"] if "forecast" in path][0]
        self.assertEqual(forecast_query["temperature_unit"], ["fahrenheit"])
        self.assertEqual(forecast_query["wind_speed_unit"], ["mph"])

    def test_no_city_set_is_a_readable_error(self):
        self.settings.weather_location = ""
        with self.assertRaises(MairoError) as caught:
            self.service.fetch()
        self.assertIn("No city is set", caught.exception.message)

    def test_an_unknown_place_is_a_readable_error(self):
        STATE["geocode"] = {"generationtime_ms": 0.4}  # the real shape when nothing matches
        with self.assertRaises(MairoError) as caught:
            self.service.fetch()
        self.assertIn("could not be found", caught.exception.message)

    def test_a_service_error_is_readable(self):
        STATE["status"] = 500
        with self.assertRaises(MairoError) as caught:
            self.service.fetch()
        self.assertIn("refused the request", caught.exception.message)

    def test_an_unreachable_service_is_readable(self):
        os.environ["OPEN_METEO_GEOCODING_URL"] = "http://127.0.0.1:9/v1/search"
        try:
            with self.assertRaises(MairoError) as caught:
                WeatherService(self.settings).fetch()
            self.assertIn("could not be reached", caught.exception.message)
        finally:
            os.environ["OPEN_METEO_GEOCODING_URL"] = (
                f"http://127.0.0.1:{self.server.server_address[1]}/v1/search"
            )

    def test_missing_fields_do_not_crash_the_parse(self):
        STATE["forecast"] = {
            "current": {"temperature_2m": 9.0},
            "daily": {"time": ["2026-09-08"], "temperature_2m_max": [12.0]},
        }
        report = self.service.fetch()
        self.assertAlmostEqual(report.temperature, 9.0)
        self.assertIsNone(report.humidity)
        self.assertIsNone(report.days[0].low)
        self.assertEqual(report.days[0].condition, "Unknown conditions")

    def test_an_empty_answer_is_an_error_not_a_blank_report(self):
        STATE["forecast"] = {"current": {}, "daily": {}}
        with self.assertRaises(MairoError):
            self.service.fetch()


class ToolTests(unittest.TestCase):
    """The tool Mairo calls when asked about the weather."""

    server = None

    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        os.environ["OPEN_METEO_GEOCODING_URL"] = f"{base}/v1/search"
        os.environ["OPEN_METEO_FORECAST_URL"] = f"{base}/v1/forecast"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        os.environ.pop("OPEN_METEO_GEOCODING_URL", None)
        os.environ.pop("OPEN_METEO_FORECAST_URL", None)

    def _tools(self):
        from app.database.db import Database
        from app.memory.memory_store import MemoryStore
        from app.tools.base import ToolContext
        from app.tools.registry import build_default_registry

        STATE["geocode"] = GEOCODE_BODY
        STATE["forecast"] = FORECAST_BODY
        STATE["status"] = 200
        database = Database(Path(os.environ["MAIRO_HOME"]) / f"w-{os.urandom(4).hex()}.db")
        settings = Settings()
        settings.weather_location = "Vienna"
        return build_default_registry(
            ToolContext(settings=settings, memory=MemoryStore(database), db=database)
        ), settings

    def test_the_tool_is_registered(self):
        tools, _ = self._tools()
        self.assertIsNotNone(tools.get("get_weather"))
        self.assertFalse(tools.get("get_weather").requires_confirmation)

    def test_the_tool_reports_conditions(self):
        tools, _ = self._tools()
        result = tools.run("get_weather", {})
        self.assertTrue(result.ok)
        self.assertIn("Vienna, Austria", result.message)
        self.assertIn("light rain", result.message)
        self.assertIn("Wed", result.message)

    def test_the_tool_reports_a_failure_readably(self):
        tools, settings = self._tools()
        settings.weather_location = ""
        result = tools.run("get_weather", {"location": ""})
        self.assertFalse(result.ok)
        self.assertIn("No city is set", result.message)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class PanelTests(unittest.TestCase):
    """The weather panel's three states: reading, waiting, and unavailable."""

    app = None

    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        try:
            from PySide6.QtWidgets import QApplication
        except ImportError:  # pragma: no cover
            raise unittest.SkipTest("PySide6 is not installed")
        cls.app = QApplication.instance() or QApplication([])

    def _panel(self, location="Vienna", enabled=True):
        from app.ui.theme import get_palette
        from app.ui.weather_panel import WeatherPanel

        settings = Settings()
        settings.weather_location = location
        settings.weather_enabled = enabled
        return WeatherPanel(settings, get_palette("nebula")), settings

    def test_a_report_fills_the_panel(self):
        panel, _ = self._panel()
        panel._on_loaded(
            WeatherReport(
                location="Vienna, Austria",
                temperature=17.4,
                feels_like=16.1,
                humidity=68,
                wind=12.3,
                code=61,
                days=[
                    DayForecast("2026-09-08", 19.2, 11.0, 61),
                    DayForecast("2026-09-09", 21.5, 12.4, 3),
                    DayForecast("2026-09-10", 24.0, 13.9, 0),
                    DayForecast("2026-09-11", 20.1, 12.2, 95),
                ],
            )
        )
        self.assertEqual(panel.place_label.text(), "Vienna, Austria")
        self.assertEqual(panel.temperature_label.text(), "17°C")
        self.assertEqual(panel.condition_label.text(), "Light rain")
        self.assertIn("68% humidity", panel.detail_label.text())
        # The forecast rows start at tomorrow, not today.
        self.assertEqual(panel._forecast_labels[0][0].text(), "Wed")
        self.assertEqual(panel._forecast_labels[0][2].text(), "22° / 12°")

    def test_a_failure_clears_the_readings(self):
        panel, _ = self._panel()
        panel._on_loaded(WeatherReport(location="Vienna", temperature=17.0, code=0))
        panel._on_failed("The weather service could not be reached.")
        self.assertEqual(panel.temperature_label.text(), "")
        self.assertEqual(panel.place_label.text(), "")
        self.assertIn("could not be reached", panel.condition_label.text())

    def test_no_city_set_asks_for_one(self):
        panel, _ = self._panel(location="")
        panel.refresh()
        self.assertIn("Set your city", panel.condition_label.text())

    def test_switched_off_says_so(self):
        panel, _ = self._panel(enabled=False)
        panel.refresh()
        self.assertIn("switched off", panel.condition_label.text())

    def test_the_panel_paints(self):
        panel, _ = self._panel()
        panel.resize(240, 220)
        panel.grab()
