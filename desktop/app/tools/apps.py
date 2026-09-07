"""Launching desktop applications by name."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.tools.base import Tool, ToolResult
from app.utils.logging_setup import get_logger
from app.utils.platform_utils import expand, is_windows, launch_detached, open_path, which

log = get_logger("tools.apps")

# Spoken name -> (executables to look for on PATH, likely install locations).
# Windows paths use environment variables so they work for any user account.
KNOWN_APPS: dict[str, dict[str, list[str]]] = {
    "spotify": {
        "commands": ["spotify"],
        "windows": [
            r"%APPDATA%\Spotify\Spotify.exe",
            r"%LOCALAPPDATA%\Microsoft\WindowsApps\Spotify.exe",
            r"%PROGRAMFILES%\Spotify\Spotify.exe",
        ],
        "uri": ["spotify:"],
        "web": ["https://open.spotify.com"],
    },
    "discord": {
        "commands": ["discord"],
        "windows": [
            r"%LOCALAPPDATA%\Discord\Update.exe",
            r"%LOCALAPPDATA%\Microsoft\WindowsApps\Discord.exe",
        ],
        "windows_args": ["--processStart", "Discord.exe"],
        "web": ["https://discord.com/app"],
    },
    "chrome": {
        "commands": ["google-chrome", "chrome", "chromium"],
        "windows": [
            r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe",
            r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe",
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
        ],
    },
    "vs code": {
        "commands": ["code"],
        "windows": [
            r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe",
            r"%PROGRAMFILES%\Microsoft VS Code\Code.exe",
        ],
    },
    "edge": {
        "commands": ["microsoft-edge"],
        "windows": [
            r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe",
            r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe",
        ],
    },
    "firefox": {
        "commands": ["firefox"],
        "windows": [r"%PROGRAMFILES%\Mozilla Firefox\firefox.exe"],
    },
    "steam": {
        "commands": ["steam"],
        "windows": [r"%PROGRAMFILES(X86)%\Steam\steam.exe"],
    },
    "notepad": {"commands": ["notepad"], "windows": [r"%WINDIR%\system32\notepad.exe"]},
    "calculator": {"commands": ["calc"], "windows": [r"%WINDIR%\system32\calc.exe"]},
    "file explorer": {"commands": ["explorer"], "windows": [r"%WINDIR%\explorer.exe"]},
    "terminal": {
        "commands": ["wt", "powershell", "cmd", "gnome-terminal", "x-terminal-emulator"],
        "windows": [r"%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe"],
    },
    "task manager": {"commands": ["taskmgr"], "windows": [r"%WINDIR%\system32\taskmgr.exe"]},
    "settings": {"commands": [], "windows": [], "uri": ["ms-settings:"]},
}

ALIASES = {
    "vscode": "vs code",
    "visual studio code": "vs code",
    "code": "vs code",
    "google chrome": "chrome",
    "microsoft edge": "edge",
    "explorer": "file explorer",
    "files": "file explorer",
    "calc": "calculator",
    "windows terminal": "terminal",
    "cmd": "terminal",
    "powershell": "terminal",
}


def canonical_name(name: str) -> str:
    cleaned = name.strip().lower().removeprefix("the ").removesuffix(" app").strip()
    return ALIASES.get(cleaned, cleaned)


def _first_existing(paths: list[str]) -> Path | None:
    for raw in paths:
        candidate = expand(raw)
        if candidate.exists():
            return candidate
    return None


def launch_named_app(name: str, memory: Any = None) -> ToolResult:
    """Find and start an application, trying the most reliable route first."""
    key = canonical_name(name)
    if not key:
        return ToolResult.failure("No application name was given.")

    # 1. A path the user asked Mairo to remember wins over the built-in list.
    if memory is not None:
        remembered = memory.get(f"app_path_{key}") or memory.get(f"{key}_path")
        if remembered:
            path = expand(remembered)
            if path.exists():
                try:
                    open_path(path)
                    return ToolResult.success(f"Opened {name} from your saved location.")
                except OSError as exc:
                    log.warning("Saved path for %s failed: %s", key, exc)

    spec = KNOWN_APPS.get(key, {})

    # 2. A known install location on this machine.
    if is_windows():
        found = _first_existing(spec.get("windows", []))
        if found:
            args = [str(found)] + list(spec.get("windows_args", []))
            try:
                launch_detached(args)
                return ToolResult.success(f"Opened {name}.")
            except OSError as exc:
                log.warning("Launching %s failed: %s", found, exc)

    # 3. Anything on PATH, including the raw name the user said.
    for command in list(spec.get("commands", [])) + [key, name.strip()]:
        if not command:
            continue
        resolved = which(command)
        if resolved:
            try:
                launch_detached([resolved])
                return ToolResult.success(f"Opened {name}.")
            except OSError as exc:
                log.warning("Launching %s failed: %s", resolved, exc)

    # 4. A protocol handler (Spotify and Windows Settings register these).
    for uri in spec.get("uri", []):
        try:
            open_path(uri)
            return ToolResult.success(f"Opened {name}.")
        except OSError:
            pass

    # 5. On Windows, let the shell try the bare name (covers Store apps).
    if is_windows():
        try:
            os.startfile(key)  # type: ignore[attr-defined]
            return ToolResult.success(f"Opened {name}.")
        except OSError:
            pass

    # 6. Last resort: the web version, if the app has one.
    for url in spec.get("web", []):
        try:
            open_path(url)
            return ToolResult.success(
                f"{name} does not appear to be installed, so its web version was opened instead."
            )
        except OSError:
            pass

    return ToolResult.failure(
        f"{name} could not be found on this computer. Ask the user for the full path to its "
        f"program file, then remember it as 'app_path_{key}'."
    )


class OpenApplicationTool(Tool):
    name = "open_application"
    description = (
        "Open a desktop application by name, for example Spotify, Chrome, VS Code, Notepad or "
        "Steam. Use this for any installed program the user asks to open."
    )
    parameters = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "The application name as the user said it, e.g. 'Spotify'.",
            }
        },
        "required": ["name"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        return launch_named_app(str(args.get("name", "")), self.memory)


class _FixedAppTool(Tool):
    """Shared implementation for the one-shot launch tools."""

    app_key = ""
    parameters = {"type": "object", "properties": {}}

    def run(self, args: dict[str, Any]) -> ToolResult:
        return launch_named_app(self.app_key, self.memory)


class LaunchSpotifyTool(_FixedAppTool):
    name = "launch_spotify"
    description = "Open Spotify."
    app_key = "spotify"


class LaunchDiscordTool(_FixedAppTool):
    name = "launch_discord"
    description = "Open Discord."
    app_key = "discord"


class LaunchChromeTool(_FixedAppTool):
    name = "launch_chrome"
    description = "Open the Google Chrome browser."
    app_key = "chrome"


class LaunchVSCodeTool(_FixedAppTool):
    name = "launch_vscode"
    description = "Open Visual Studio Code."
    app_key = "vs code"
