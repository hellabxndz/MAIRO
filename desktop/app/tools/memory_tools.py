"""Tools that let the model read and write Mairo's long-term memory."""

from __future__ import annotations

from typing import Any

from app.tools.base import Tool, ToolResult


class RememberTool(Tool):
    name = "remember"
    description = (
        "Store something about the user so it is available in future sessions: their preferred "
        "name, favourite apps, sites they use, custom shortcuts or small preferences. Use a "
        "short snake_case key such as 'preferred_browser' or 'preferred_name'."
    )
    parameters = {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "Short identifier, e.g. 'preferred_browser'."},
            "value": {"type": "string", "description": "The fact to store, in plain words."},
            "category": {
                "type": "string",
                "enum": ["preference", "person", "app", "website", "shortcut", "other"],
                "description": "How to group this memory. Defaults to preference.",
            },
        },
        "required": ["key", "value"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        key = str(args.get("key", "")).strip()
        value = str(args.get("value", "")).strip()
        if not key or not value:
            return ToolResult.failure("Both a key and a value are needed to remember something.")
        category = str(args.get("category", "preference")).strip() or "preference"
        stored = self.memory.remember(key, value, category)
        return ToolResult.success(f"Remembered '{stored}': {value}")


class RecallMemoryTool(Tool):
    name = "recall_memory"
    description = (
        "Look up what is remembered about the user. Call with no search term to list everything, "
        "for example when the user asks what you remember about them."
    )
    parameters = {
        "type": "object",
        "properties": {
            "search": {"type": "string", "description": "Optional word to filter memories by."}
        },
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        term = str(args.get("search", "")).strip()
        entries = self.memory.search(term) if term else self.memory.all()
        if not entries:
            return ToolResult.success(
                "Nothing is stored yet." if not term else f"Nothing is stored about '{term}'."
            )
        listing = "; ".join(f"{e['key']}: {e['value']}" for e in entries[:30])
        return ToolResult.success(f"{len(entries)} memory item(s): {listing}")


class ForgetMemoryTool(Tool):
    name = "forget_memory"
    description = "Delete one stored memory. Use the key, or the words the user used for it."
    parameters = {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "The memory key or phrase to remove."}
        },
        "required": ["key"],
    }
    requires_confirmation = True

    def confirmation_text(self, args: dict[str, Any]) -> str:
        return f"Permanently forget the memory '{args.get('key', '')}'?"

    def run(self, args: dict[str, Any]) -> ToolResult:
        key = str(args.get("key", "")).strip()
        if not key:
            return ToolResult.failure("No memory key was given.")
        if self.memory.forget(key):
            return ToolResult.success(f"Forgotten: {key}")
        return ToolResult.failure(f"There is no stored memory matching '{key}'.")
