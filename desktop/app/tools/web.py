"""Opening websites and running searches in the default browser."""

from __future__ import annotations

import webbrowser
from typing import Any
from urllib.parse import quote_plus, urlparse

from app.tools.base import Tool, ToolResult
from app.utils.logging_setup import get_logger

log = get_logger("tools.web")

SHORTCUTS = {
    "youtube": "https://www.youtube.com",
    "google": "https://www.google.com",
    "gmail": "https://mail.google.com",
    "github": "https://github.com",
    "spotify": "https://open.spotify.com",
    "netflix": "https://www.netflix.com",
    "reddit": "https://www.reddit.com",
    "chatgpt": "https://chat.openai.com",
    "maps": "https://maps.google.com",
    "drive": "https://drive.google.com",
    "calendar": "https://calendar.google.com",
}


def normalise_url(raw: str) -> str:
    """Turn 'youtube', 'example.com' or a full URL into something openable."""
    value = raw.strip().strip("<>").rstrip(".")
    if not value:
        return ""
    lowered = value.lower()
    if lowered in SHORTCUTS:
        return SHORTCUTS[lowered]
    if "://" in value:
        parsed = urlparse(value)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return value
        return ""  # refuse file:, javascript: and similar
    if " " in value or "." not in value:
        return ""
    return f"https://{value}"


def open_in_browser(url: str) -> bool:
    try:
        return bool(webbrowser.open(url, new=2))
    except Exception as exc:  # webbrowser raises assorted OS errors
        log.warning("Browser launch failed: %s", exc)
        return False


class OpenWebsiteTool(Tool):
    name = "open_website"
    description = (
        "Open a website in the default browser. Accepts a full URL or a well-known site name "
        "such as 'youtube' or 'github'."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "A URL or site name, e.g. 'github.com'."}
        },
        "required": ["url"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        raw = str(args.get("url", ""))
        url = normalise_url(raw)
        if not url:
            return ToolResult.failure(
                f"'{raw}' is not a web address Mairo can open. Ask for a full https:// address."
            )
        if not open_in_browser(url):
            return ToolResult.failure("No default browser could be started.")
        return ToolResult.success(f"Opened {url}.")


class SearchGoogleTool(Tool):
    name = "search_google"
    description = "Search Google for a phrase and show the results in the browser."
    parameters = {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "What to search for."}},
        "required": ["query"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        query = str(args.get("query", "")).strip()
        if not query:
            return ToolResult.failure("No search phrase was given.")
        if not open_in_browser(f"https://www.google.com/search?q={quote_plus(query)}"):
            return ToolResult.failure("No default browser could be started.")
        return ToolResult.success(f"Searching Google for {query}.")


class SearchYouTubeTool(Tool):
    name = "search_youtube"
    description = "Search YouTube for a phrase and show the results in the browser."
    parameters = {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "What to search for."}},
        "required": ["query"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        query = str(args.get("query", "")).strip()
        if not query:
            return ToolResult.failure("No search phrase was given.")
        url = f"https://www.youtube.com/results?search_query={quote_plus(query)}"
        if not open_in_browser(url):
            return ToolResult.failure("No default browser could be started.")
        return ToolResult.success(f"Searching YouTube for {query}.")
