"""Opening local files and folders."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.tools.base import Tool, ToolResult
from app.utils.platform_utils import expand, known_folder, open_path


class OpenPathTool(Tool):
    name = "open_path"
    description = (
        "Open a local file or folder in the system file manager or its default program. "
        "Accepts a full path, or a common folder name such as 'downloads', 'documents', "
        "'desktop', 'pictures', 'music' or 'videos'."
    )
    parameters = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "A full path, or a folder name like 'downloads'.",
            }
        },
        "required": ["path"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        raw = str(args.get("path", "")).strip().strip('"')
        if not raw:
            return ToolResult.failure("No file or folder was given.")

        target: Path | None = known_folder(raw)
        if target is None:
            remembered = self.memory.get(f"folder_{raw.lower().replace(' ', '_')}")
            target = expand(remembered) if remembered else expand(raw)

        if not target.exists():
            return ToolResult.failure(
                f"There is nothing at {target}. Ask the user for the exact path."
            )
        try:
            open_path(target)
        except OSError as exc:
            return ToolResult.failure(f"{target} could not be opened: {exc}")
        kind = "folder" if target.is_dir() else "file"
        return ToolResult.success(f"Opened the {kind} {target}.")
