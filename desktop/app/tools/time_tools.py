"""Date and time."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.tools.base import Tool, ToolResult


class CurrentDateTimeTool(Tool):
    name = "get_datetime"
    description = (
        "Get the current local date and time. Use this whenever the user asks what time or "
        "day it is, or when you need today's date to answer."
    )
    parameters = {
        "type": "object",
        "properties": {
            "format": {
                "type": "string",
                "enum": ["both", "time", "date"],
                "description": "Which part the user asked for. Defaults to both.",
            }
        },
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        now = datetime.now()
        wanted = str(args.get("format", "both")).lower()
        time_text = now.strftime("%H:%M")
        date_text = now.strftime("%A, %d %B %Y")
        if wanted == "time":
            message = f"The time is {time_text}."
        elif wanted == "date":
            message = f"Today is {date_text}."
        else:
            message = f"It is {time_text} on {date_text}."
        return ToolResult.success(message, iso=now.isoformat(timespec="seconds"))
