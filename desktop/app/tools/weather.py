"""Letting Mairo answer questions about the weather out loud."""

from __future__ import annotations

from typing import Any

from app.tools.base import Tool, ToolResult
from app.utils.errors import MairoError
from app.utils.weather import WeatherService


class GetWeatherTool(Tool):
    name = "get_weather"
    description = (
        "Get the current weather and the next few days for a place. Leave the location out to "
        "use the city the user set in Settings. Use this whenever the user asks about weather, "
        "temperature, rain or what to wear."
    )
    parameters = {
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "A city name, e.g. 'Vienna'. Omit for the user's own city.",
            }
        },
    }

    def __init__(self, context: Any) -> None:
        super().__init__(context)
        self._service = WeatherService(context.settings)

    def run(self, args: dict[str, Any]) -> ToolResult:
        location = str(args.get("location", "")).strip()
        try:
            report = self._service.fetch(location or None)
        except MairoError as exc:
            return ToolResult.failure(exc.display())

        details = []
        if report.feels_like is not None:
            details.append(f"feels like {round(report.feels_like)}{report.temperature_unit}")
        if report.humidity is not None:
            details.append(f"humidity {round(report.humidity)}%")
        if report.wind is not None:
            details.append(f"wind {round(report.wind)} {report.wind_unit}")

        forecast = "; ".join(
            f"{day.label} {day.condition.lower()} {round(day.low)}–{round(day.high)}"
            f"{report.temperature_unit}"
            for day in report.days[:4]
            if day.high is not None and day.low is not None
        )

        message = (
            f"{report.location}: {report.temperature_text()}, {report.condition.lower()}"
            + (f" ({', '.join(details)})" if details else "")
            + (f". Coming days — {forecast}." if forecast else ".")
        )
        return ToolResult.success(message, location=report.location)
