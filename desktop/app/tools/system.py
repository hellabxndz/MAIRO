"""Computer control: volume, screenshots, clipboard and locking.

The three actions that touch the user's privacy or interrupt them —
screenshot, clipboard and lock — are marked `requires_confirmation`, so the
interface asks before Mairo runs them.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.config.paths import screenshots_dir
from app.tools.base import Tool, ToolResult
from app.utils import audio_control
from app.utils.logging_setup import get_logger
from app.utils.platform_utils import lock_workstation, open_path

log = get_logger("tools.system")

CLIPBOARD_PREVIEW_CHARS = 2000


class SetVolumeTool(Tool):
    name = "set_volume"
    description = "Set the computer's output volume to an exact level from 0 to 100."
    parameters = {
        "type": "object",
        "properties": {
            "level": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "The target volume percentage.",
            }
        },
        "required": ["level"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        try:
            level = int(args.get("level"))
        except (TypeError, ValueError):
            return ToolResult.failure("A volume level between 0 and 100 is needed.")
        ok, message = audio_control.set_volume(level)
        return ToolResult(ok, message)


class AdjustVolumeTool(Tool):
    name = "adjust_volume"
    description = (
        "Turn the volume up or down by a relative amount. Use this for 'turn it down a bit' "
        "or 'louder'. A normal step is 10 to 20 points."
    )
    parameters = {
        "type": "object",
        "properties": {
            "direction": {"type": "string", "enum": ["up", "down"]},
            "amount": {
                "type": "integer",
                "description": "Percentage points to change by. Defaults to 15.",
            },
        },
        "required": ["direction"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        direction = str(args.get("direction", "")).lower()
        if direction not in ("up", "down"):
            return ToolResult.failure("The direction must be 'up' or 'down'.")
        try:
            amount = abs(int(args.get("amount") or 15))
        except (TypeError, ValueError):
            amount = 15
        amount = max(1, min(amount, 100))
        ok, message = audio_control.adjust_volume(amount if direction == "up" else -amount)
        return ToolResult(ok, message)


class MuteTool(Tool):
    name = "set_mute"
    description = "Mute or unmute the computer's sound."
    parameters = {
        "type": "object",
        "properties": {
            "muted": {"type": "boolean", "description": "True to mute, false to unmute."}
        },
        "required": ["muted"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        muted = bool(args.get("muted", True))
        ok, message = audio_control.set_mute(muted)
        return ToolResult(ok, message)


class ScreenshotTool(Tool):
    name = "take_screenshot"
    description = (
        "Capture the current screen and save it as a PNG in the user's Mairo screenshots "
        "folder. The user is asked to confirm first."
    )
    parameters = {
        "type": "object",
        "properties": {
            "open_after": {
                "type": "boolean",
                "description": "Open the saved image afterwards. Defaults to false.",
            }
        },
    }
    requires_confirmation = True

    def confirmation_text(self, args: dict[str, Any]) -> str:
        return "Mairo wants to capture your screen and save it as an image. Allow this?"

    def run(self, args: dict[str, Any]) -> ToolResult:
        try:
            import mss
            import mss.tools
        except ImportError:
            return ToolResult.failure(
                "Screen capture needs the 'mss' package, which is not installed."
            )
        path = screenshots_dir() / f"mairo-{datetime.now():%Y%m%d-%H%M%S}.png"
        try:
            with mss.mss() as capture:
                shot = capture.grab(capture.monitors[0])
                mss.tools.to_png(shot.rgb, shot.size, output=str(path))
        except Exception as exc:
            log.warning("Screenshot failed: %s", exc)
            return ToolResult.failure(f"The screen could not be captured: {exc}")
        if bool(args.get("open_after")):
            try:
                open_path(path)
            except OSError:
                pass
        return ToolResult.success(f"Screenshot saved to {path}.")


class ReadClipboardTool(Tool):
    name = "read_clipboard"
    description = (
        "Read the text currently on the clipboard. Use this when the user asks what is on "
        "their clipboard or asks you to work with what they just copied."
    )
    parameters = {"type": "object", "properties": {}}
    requires_confirmation = True

    def confirmation_text(self, args: dict[str, Any]) -> str:
        return "Mairo wants to read your clipboard contents. Allow this?"

    def run(self, args: dict[str, Any]) -> ToolResult:
        try:
            import pyperclip
        except ImportError:
            return ToolResult.failure(
                "Clipboard access needs the 'pyperclip' package, which is not installed."
            )
        try:
            content = pyperclip.paste() or ""
        except Exception as exc:
            return ToolResult.failure(f"The clipboard could not be read: {exc}")
        if not content.strip():
            return ToolResult.success("The clipboard is empty.")
        truncated = content[:CLIPBOARD_PREVIEW_CHARS]
        suffix = "… (truncated)" if len(content) > CLIPBOARD_PREVIEW_CHARS else ""
        return ToolResult.success(f"The clipboard contains: {truncated}{suffix}")


class LockComputerTool(Tool):
    name = "lock_computer"
    description = "Lock the computer's screen. The user is asked to confirm first."
    parameters = {"type": "object", "properties": {}}
    requires_confirmation = True

    def confirmation_text(self, args: dict[str, Any]) -> str:
        return "Mairo is about to lock this computer. You will need your password to get back in."

    def run(self, args: dict[str, Any]) -> ToolResult:
        if lock_workstation():
            return ToolResult.success("Locking the computer now.")
        return ToolResult.failure("This computer could not be locked from Mairo.")
