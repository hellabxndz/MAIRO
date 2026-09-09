"""Collects the available tools and exposes them to the model."""

from __future__ import annotations

from typing import Any, Iterable, Type

from app.tools.base import Tool, ToolContext, ToolResult
from app.utils.logging_setup import get_logger

log = get_logger("tools")


class ToolRegistry:
    """Name-to-tool lookup plus the JSON schema list the model receives."""

    def __init__(self, context: ToolContext) -> None:
        self.context = context
        self._tools: dict[str, Tool] = {}

    def register(self, tool_class: Type[Tool]) -> None:
        tool = tool_class(self.context)
        if not tool.name:
            raise ValueError(f"{tool_class.__name__} has no name")
        if tool.name in self._tools:
            log.warning("Tool %s registered twice; keeping the first", tool.name)
            return
        self._tools[tool.name] = tool

    def register_all(self, tool_classes: Iterable[Type[Tool]]) -> None:
        for tool_class in tool_classes:
            self.register(tool_class)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools)

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.schema() for tool in self._tools.values()]

    def run(self, name: str, args: dict[str, Any]) -> ToolResult:
        tool = self.get(name)
        if tool is None:
            return ToolResult.failure(f"There is no tool called {name}.")
        try:
            log.info("Running tool %s", name)
            return tool.run(args or {})
        except Exception as exc:  # a broken tool must never end the session
            log.exception("Tool %s crashed", name)
            return ToolResult.failure(f"{name} could not complete: {exc}")


def build_default_registry(context: ToolContext) -> ToolRegistry:
    """Every tool shipped with the MVP."""
    from app.tools import apps, files, notes, system, time_tools, web, web_fetch
    from app.tools import memory_tools

    registry = ToolRegistry(context)
    registry.register_all(
        [
            apps.OpenApplicationTool,
            apps.LaunchSpotifyTool,
            apps.LaunchDiscordTool,
            apps.LaunchChromeTool,
            apps.LaunchVSCodeTool,
            web.OpenWebsiteTool,
            web.SearchGoogleTool,
            web.SearchYouTubeTool,
            web_fetch.ReadWebPageTool,
            files.OpenPathTool,
            time_tools.CurrentDateTimeTool,
            notes.CreateNoteTool,
            notes.ReadNotesTool,
            system.SetVolumeTool,
            system.AdjustVolumeTool,
            system.MuteTool,
            system.ScreenshotTool,
            system.ReadClipboardTool,
            system.LockComputerTool,
            memory_tools.RememberTool,
            memory_tools.RecallMemoryTool,
            memory_tools.ForgetMemoryTool,
        ]
    )
    log.info("Registered %d tools", len(registry.names()))
    return registry
