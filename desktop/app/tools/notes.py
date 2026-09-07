"""Quick notes, stored in SQLite and mirrored to a readable text file."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.config.paths import notes_dir
from app.tools.base import Tool, ToolResult
from app.utils.logging_setup import get_logger

log = get_logger("tools.notes")

MAX_NOTES_RETURNED = 20


class CreateNoteTool(Tool):
    name = "create_note"
    description = "Save a short note for the user."
    parameters = {
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "The note exactly as the user dictated it."}
        },
        "required": ["text"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        text = str(args.get("text", "")).strip()
        if not text:
            return ToolResult.failure("The note was empty, so nothing was saved.")
        self.context.db.execute("INSERT INTO notes (body) VALUES (?)", (text,))
        try:
            stamp = datetime.now()
            path = notes_dir() / f"{stamp:%Y-%m-%d}.txt"
            with path.open("a", encoding="utf-8") as handle:
                handle.write(f"[{stamp:%H:%M}] {text}\n")
        except OSError as exc:
            log.warning("Note saved to the database but not to disk: %s", exc)
        return ToolResult.success(f"Note saved: {text}")


class ReadNotesTool(Tool):
    name = "read_notes"
    description = "Read back the user's saved notes, newest first."
    parameters = {
        "type": "object",
        "properties": {
            "search": {
                "type": "string",
                "description": "Optional word to filter notes by.",
            },
            "limit": {"type": "integer", "description": "How many notes to return (default 5)."},
        },
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        try:
            limit = max(1, min(int(args.get("limit") or 5), MAX_NOTES_RETURNED))
        except (TypeError, ValueError):
            limit = 5
        search = str(args.get("search", "")).strip()
        if search:
            rows = self.context.db.query(
                "SELECT body, created_at FROM notes WHERE body LIKE ? ORDER BY id DESC LIMIT ?",
                (f"%{search}%", limit),
            )
        else:
            rows = self.context.db.query(
                "SELECT body, created_at FROM notes ORDER BY id DESC LIMIT ?", (limit,)
            )
        if not rows:
            return ToolResult.success("There are no saved notes yet.")
        listing = "; ".join(f"{row['created_at'][:16]} — {row['body']}" for row in rows)
        return ToolResult.success(f"{len(rows)} note(s): {listing}")
