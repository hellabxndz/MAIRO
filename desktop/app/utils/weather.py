"""Weather from Open-Meteo.

Open-Meteo needs no API key and no account, which is why Mairo uses it: the
forecast works the moment the app is installed. Nothing here invents a
reading — every failure raises with a sentence the interface can show.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.utils.errors import MairoError
from app.utils.logging_setup import get_logger

log = get_logger("weather")

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT = 12
FORECAST_DAYS = 4
USER_AGENT = "Mairo/0.1 (local desktop assistant)"

# World Meteorological Organization weather codes, as plain English.
WMO_CONDITIONS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
}


def describe_code(code: int | None) -> str:
    if code is None:
        return "Unknown conditions"
    return WMO_CONDITIONS.get(int(code), "Unsettled")


def glyph_for_code(code: int | None, is_day: bool = True) -> str:
    """A single character standing in for the sky, drawn with the system font."""
    if code is None:
        return "•"
    code = int(code)
    if code == 0:
        return "☀" if is_day else "☾"
    if code in (1, 2):
        return "⛅" if is_day else "☁"
    if code == 3:
        return "☁"
    if code in (45, 48):
        return "≈"
    if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82):
        return "☂"
    if code in (71, 73, 75, 77, 85, 86):
        return "❄"
    if code in (95, 96, 99):
        return "⚡"
    return "•"


@dataclass
class DayForecast:
    date: str
    high: float | None
    low: float | None
    code: int | None

    @property
    def label(self) -> str:
        try:
            return datetime.fromisoformat(self.date).strftime("%a")
        except ValueError:
            return self.date

    @property
    def condition(self) -> str:
        return describe_code(self.code)

    @property
    def glyph(self) -> str:
        return glyph_for_code(self.code, True)


@dataclass
class WeatherReport:
    location: str
    temperature: float | None = None
    feels_like: float | None = None
    humidity: float | None = None
    wind: float | None = None
    code: int | None = None
    is_day: bool = True
    temperature_unit: str = "°C"
    wind_unit: str = "km/h"
    days: list[DayForecast] = field(default_factory=list)
    fetched_at: datetime = field(default_factory=datetime.now)

    @property
    def condition(self) -> str:
        return describe_code(self.code)

    @property
    def glyph(self) -> str:
        return glyph_for_code(self.code, self.is_day)

    def temperature_text(self) -> str:
        if self.temperature is None:
            return "—"
        return f"{round(self.temperature)}{self.temperature_unit}"

    def spoken_summary(self) -> str:
        """One sentence, the way Mairo should say it out loud."""
        if self.temperature is None:
            return f"No temperature is available for {self.location}."
        parts = [
            f"In {self.location} it is {round(self.temperature)} degrees "
            f"and {self.condition.lower()}"
        ]
        if self.feels_like is not None and abs(self.feels_like - self.temperature) >= 2:
            parts.append(f", feeling like {round(self.feels_like)}")
        if self.days:
            today = self.days[0]
            if today.high is not None and today.low is not None:
                parts.append(
                    f". Today runs between {round(today.low)} and {round(today.high)} degrees"
                )
        if len(self.days) > 1:
            tomorrow = self.days[1]
            if tomorrow.high is not None:
                parts.append(
                    f". Tomorrow: {tomorrow.condition.lower()}, "
                    f"up to {round(tomorrow.high)} degrees"
                )
        return "".join(parts) + "."


def _get_json(url: str, params: dict[str, Any]) -> dict:
    """One GET, with every failure turned into a sentence worth showing."""
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        log.warning("Weather service returned %s", exc.code)
        raise MairoError(
            "The weather service refused the request.",
            hint=f"It answered with status {exc.code}. Try again in a moment.",
        ) from exc
    except urllib.error.URLError as exc:
        log.warning("Weather service unreachable: %s", exc.reason)
        raise MairoError(
            "The weather service could not be reached.",
            hint="Check your internet connection.",
        ) from exc
    except (TimeoutError, OSError) as exc:
        raise MairoError(
            "The weather service did not answer in time.", hint="Try again in a moment."
        ) from exc
    except json.JSONDecodeError as exc:
        raise MairoError("The weather service sent something unreadable.") from exc


class WeatherService:
    """Looks up a place once, then fetches its forecast on demand."""

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self._places: dict[str, tuple[float, float, str]] = {}

    # The endpoints are overridable so the tests can point at a local server,
    # and so anyone behind a mirror can redirect them.
    @property
    def geocoding_url(self) -> str:
        return os.environ.get("OPEN_METEO_GEOCODING_URL", "").strip() or GEOCODING_URL

    @property
    def forecast_url(self) -> str:
        return os.environ.get("OPEN_METEO_FORECAST_URL", "").strip() or FORECAST_URL

    def clear_cache(self) -> None:
        self._places.clear()

    def find_place(self, name: str) -> tuple[float, float, str]:
        """Turn a city name into coordinates and a display label."""
        key = name.strip().lower()
        if not key:
            raise MairoError(
                "No city is set for the weather.",
                hint="Open Settings and type your city under Weather.",
            )
        if key in self._places:
            return self._places[key]

        payload = _get_json(
            self.geocoding_url,
            {"name": name.strip(), "count": 1, "language": "en", "format": "json"},
        )
        results = payload.get("results") or []
        if not results:
            raise MairoError(
                f"No place called “{name.strip()}” could not be found.",
                hint="Try the city name on its own, for example “Vienna”.",
            )
        first = results[0]
        try:
            latitude = float(first["latitude"])
            longitude = float(first["longitude"])
        except (KeyError, TypeError, ValueError) as exc:
            raise MairoError("The weather service sent an unusable location.") from exc

        label_parts = [str(first.get("name", name.strip()))]
        country = first.get("country")
        if country:
            label_parts.append(str(country))
        place = (latitude, longitude, ", ".join(label_parts))
        self._places[key] = place
        return place

    def fetch(self, location: str | None = None, units: str | None = None) -> WeatherReport:
        """The current conditions plus the next few days."""
        name = (location or self.settings.weather_location or "").strip()
        latitude, longitude, label = self.find_place(name)
        imperial = (units or self.settings.weather_units) == "imperial"

        payload = _get_json(
            self.forecast_url,
            {
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,apparent_temperature,"
                "is_day,weather_code,wind_speed_10m",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min",
                "timezone": "auto",
                "forecast_days": FORECAST_DAYS,
                "temperature_unit": "fahrenheit" if imperial else "celsius",
                "wind_speed_unit": "mph" if imperial else "kmh",
            },
        )

        current = payload.get("current") or {}
        units_block = payload.get("current_units") or {}
        report = WeatherReport(
            location=label,
            temperature=_number(current.get("temperature_2m")),
            feels_like=_number(current.get("apparent_temperature")),
            humidity=_number(current.get("relative_humidity_2m")),
            wind=_number(current.get("wind_speed_10m")),
            code=_integer(current.get("weather_code")),
            is_day=bool(current.get("is_day", 1)),
            temperature_unit=str(units_block.get("temperature_2m", "°C")),
            wind_unit=str(units_block.get("wind_speed_10m", "km/h")),
        )

        daily = payload.get("daily") or {}
        dates = daily.get("time") or []
        highs = daily.get("temperature_2m_max") or []
        lows = daily.get("temperature_2m_min") or []
        codes = daily.get("weather_code") or []
        for index, date in enumerate(dates[:FORECAST_DAYS]):
            report.days.append(
                DayForecast(
                    date=str(date),
                    high=_number(highs[index] if index < len(highs) else None),
                    low=_number(lows[index] if index < len(lows) else None),
                    code=_integer(codes[index] if index < len(codes) else None),
                )
            )

        if report.temperature is None and not report.days:
            raise MairoError("The weather service sent no readings for that place.")
        log.info("Weather updated for %s", label)
        return report


def _number(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _integer(value: Any) -> int | None:
    try:
        return None if value is None else int(value)
    except (TypeError, ValueError):
        return None
