"""Launching desktop applications by name."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.tools.base import Tool, ToolResult
from app.utils.logging_setup import get_logger
from app.utils.platform_utils import (
    expand,
    is_macos,
    is_windows,
    launch_detached,
    open_macos_app,
    open_windows_store_app,
    open_path,
    which,
)

log = get_logger("tools.apps")

# Spoken name -> (executables to look for on PATH, likely install locations).
# Windows paths use environment variables so they work for any user account.
KNOWN_APPS: dict[str, dict[str, list[str]]] = {
    "spotify": {
        "macos": ["Spotify"],
        "commands": ["spotify"],
        "windows": [
            r"%APPDATA%\Spotify\Spotify.exe",
            r"%LOCALAPPDATA%\Microsoft\WindowsApps\Spotify.exe",
            r"%PROGRAMFILES%\Spotify\Spotify.exe",
        ],
        "uri": ["spotify:"],
        "web": ["https://open.spotify.com"],
    },
    "apple music": {
        "macos": ["Music"],
        "store": ["Apple Music"],
        "commands": [],
        "windows": [r"%PROGRAMFILES%\iTunes\iTunes.exe"],
        "web": ["https://music.apple.com"],
    },
    "discord": {
        "macos": ["Discord"],
        "commands": ["discord"],
        "windows": [
            r"%LOCALAPPDATA%\Discord\Update.exe",
            r"%LOCALAPPDATA%\Microsoft\WindowsApps\Discord.exe",
        ],
        "windows_args": ["--processStart", "Discord.exe"],
        "web": ["https://discord.com/app"],
    },
    "chrome": {
        "macos": ["Google Chrome"],
        "commands": ["google-chrome", "chrome", "chromium"],
        "windows": [
            r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe",
            r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe",
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
        ],
    },
    "vs code": {
        "macos": ["Visual Studio Code"],
        "commands": ["code"],
        "windows": [
            r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe",
            r"%PROGRAMFILES%\Microsoft VS Code\Code.exe",
        ],
    },
    "edge": {
        "macos": ["Microsoft Edge"],
        "commands": ["microsoft-edge"],
        "windows": [
            r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe",
            r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe",
        ],
    },
    "firefox": {
        "macos": ["Firefox"],
        "commands": ["firefox"],
        "windows": [r"%PROGRAMFILES%\Mozilla Firefox\firefox.exe"],
    },
    "steam": {
        "macos": ["Steam"],
        "commands": ["steam"],
        "windows": [r"%PROGRAMFILES(X86)%\Steam\steam.exe"],
    },
    "notepad": {
        "macos": ["TextEdit"],"commands": ["notepad"], "windows": [r"%WINDIR%\system32\notepad.exe"]},
    "calculator": {
        "macos": ["Calculator"],"commands": ["calc"], "windows": [r"%WINDIR%\system32\calc.exe"]},
    "file explorer": {
        "macos": ["Finder"],"commands": ["explorer"], "windows": [r"%WINDIR%\explorer.exe"]},
    "terminal": {
        "macos": ["Terminal"],
        "commands": ["wt", "powershell", "cmd", "gnome-terminal", "x-terminal-emulator"],
        "windows": [r"%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe"],
    },
    "task manager": {
        "macos": ["Activity Monitor"],"commands": ["taskmgr"], "windows": [r"%WINDIR%\system32\taskmgr.exe"]},
    "settings": {
        "macos": ["System Settings"],"commands": [], "windows": [], "uri": ["ms-settings:"]},
}

ALIASES = {
    "music": "apple music",
    "itunes": "apple music",
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


def is_plain_name(name: str) -> bool:
    """True for something that looks like an application name, not a path.

    The model chooses this argument, and text it has read could try to steer it
    towards a file path. Paths belong to open_path, which checks that the
    target exists; this tool only ever resolves names.
    """
    candidate = name.strip()
    if not candidate or len(candidate) > 80:
        return False
    if any(marker in candidate for marker in ("/", "\\", "..", "\x00", "\n")):
        return False
    return True


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
    if not name.strip():
        return ToolResult.failure("No application name was given.")
    if not is_plain_name(name):
        return ToolResult.failure(
            f"“{name.strip()[:60]}” looks like a file path rather than an application name. "
            "Use open_path for files and folders."
        )
    key = canonical_name(name)

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

    # 2. A Microsoft Store app, which has no executable to point at.
    if is_windows():
        for store_name in spec.get("store", []):
            if open_windows_store_app(store_name):
                return ToolResult.success(f"Opened {name}.")

    # 3. A known install location on this machine.
    if is_windows():
        found = _first_existing(spec.get("windows", []))
        if found:
            args = [str(found)] + list(spec.get("windows_args", []))
            try:
                launch_detached(args)
                return ToolResult.success(f"Opened {name}.")
            except OSError as exc:
                log.warning("Launching %s failed: %s", found, exc)

    # 4. On a Mac, applications are bundles rather than executables on PATH.
    if is_macos():
        for app_name in list(spec.get("macos", [])) + [name.strip().title(), name.strip()]:
            if app_name and open_macos_app(app_name):
                return ToolResult.success(f"Opened {name}.")

    # 5. Anything on PATH, including the raw name the user said.
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

    # 6. A protocol handler (Spotify and Windows Settings register these).
    for uri in spec.get("uri", []):
        try:
            open_path(uri)
            return ToolResult.success(f"Opened {name}.")
        except OSError:
            pass

    # 7. On Windows, let the shell try the bare name (covers other Store apps).
    if is_windows():
        try:
            os.startfile(key)  # type: ignore[attr-defined]
            return ToolResult.success(f"Opened {name}.")
        except OSError:
            pass

    # 8. Last resort: the web version, if the app has one.
    for url in spec.get("web", []):
        try:
            open_path(url)
            return ToolResult.success(
                f"{name} does not appear to be installed, so its web version was opened instead."
            )
        except OSError:
            pass

    return ToolResult.failure(
        f"{name} could not be found on this computer. Ask the user where it is installed, "
        f"then remember that path as 'app_path_{key}'."
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

class LaunchAppleMusicTool(_FixedAppTool):
    name = "launch_apple_music"
    description = "Open the Apple Music app."
    app_key = "apple music"
