"""Small OS-specific helpers, with graceful behaviour off Windows.

Mairo targets Windows first but stays importable and testable on macOS and
Linux; anything genuinely Windows-only reports a clear message elsewhere.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from app.utils.logging_setup import get_logger

log = get_logger("platform")


def is_windows() -> bool:
    return sys.platform == "win32"


def is_macos() -> bool:
    return sys.platform == "darwin"


def open_path(target: str | Path) -> None:
    """Open a file, folder or URL with the system default handler."""
    target = str(target)
    if is_windows():
        os.startfile(target)  # type: ignore[attr-defined]  # noqa: S606 - Windows only
    elif is_macos():
        subprocess.Popen(["open", target])
    else:
        subprocess.Popen(["xdg-open", target])


def launch_detached(command: list[str]) -> None:
    """Start a program without blocking Mairo or tying it to our lifetime."""
    kwargs: dict = {}
    if is_windows():
        kwargs["creationflags"] = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
            subprocess, "CREATE_NEW_PROCESS_GROUP", 0
        )
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kwargs)


def which(program: str) -> str | None:
    return shutil.which(program)


def expand(path: str | Path) -> Path:
    return Path(os.path.expandvars(str(path))).expanduser()


def known_folder(name: str) -> Path | None:
    """Resolve spoken folder names such as "downloads" or "my desktop"."""
    cleaned = name.strip().lower().removeprefix("my ").replace("folder", "").strip()
    home = Path.home()
    folders = {
        "home": home,
        "user": home,
        "desktop": home / "Desktop",
        "downloads": home / "Downloads",
        "download": home / "Downloads",
        "documents": home / "Documents",
        "docs": home / "Documents",
        "pictures": home / "Pictures",
        "photos": home / "Pictures",
        "music": home / "Music",
        "videos": home / "Videos",
    }
    return folders.get(cleaned)


def tap_virtual_key(code: int, times: int = 1) -> bool:
    """Press and release a Windows virtual key, e.g. a volume or media key."""
    if not is_windows():
        return False
    try:
        import ctypes

        for _ in range(times):
            ctypes.windll.user32.keybd_event(code, 0, 0, 0)  # type: ignore[attr-defined]
            ctypes.windll.user32.keybd_event(code, 0, 2, 0)  # type: ignore[attr-defined]
        return True
    except Exception as exc:
        log.warning("Key press failed: %s", exc)
        return False


def open_windows_store_app(display_name: str) -> bool:
    """Start a Microsoft Store app by the name shown in the Start menu.

    Store apps have no executable to point at, so the Start menu is asked for
    the app's id and the shell is told to launch that. The name comes from
    Mairo's own table of known applications, never from the model, and is
    checked here anyway because it is interpolated into a PowerShell filter.
    """
    if not is_windows():
        return False
    cleaned = display_name.strip()
    if not cleaned or not all(ch.isalnum() or ch in " .-+" for ch in cleaned):
        log.warning("Refusing to look up an odd Store app name: %r", display_name)
        return False
    script = (
        "(Get-StartApps | Where-Object { $_.Name -like '*" + cleaned + "*' } "
        "| Select-Object -First 1).AppID"
    )
    try:
        found = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=25,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("Looking up %s in the Start menu failed: %s", cleaned, exc)
        return False
    app_id = (found.stdout or "").strip().splitlines()
    app_id = app_id[0].strip() if app_id else ""
    if not app_id:
        log.info("%s is not in the Start menu", cleaned)
        return False
    try:
        launch_detached(["explorer.exe", f"shell:AppsFolder\\{app_id}"])
        return True
    except OSError as exc:
        log.warning("Launching Store app %s failed: %s", app_id, exc)
        return False


def open_macos_app(app_name: str) -> bool:
    """Launch a Mac application by its display name, e.g. "Google Chrome"."""
    try:
        result = subprocess.run(
            ["open", "-a", app_name], capture_output=True, timeout=15, check=False
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("Launching %s failed: %s", app_name, exc)
        return False


def lock_workstation() -> bool:
    """Lock the screen. Returns False when the platform is not supported."""
    if is_windows():
        import ctypes

        return bool(ctypes.windll.user32.LockWorkStation())  # type: ignore[attr-defined]
    if is_macos():
        subprocess.Popen(
            ["osascript", "-e", 'tell application "System Events" to keystroke "q" using {control down, command down}']
        )
        return True
    for command in (["loginctl", "lock-session"], ["xdg-screensaver", "lock"]):
        if which(command[0]):
            subprocess.Popen(command)
            return True
    return False


def set_startup_shortcut(enabled: bool, app_name: str = "Mairo") -> tuple[bool, str]:
    """Add or remove Mairo from the Windows "run at sign-in" registry key."""
    if not is_windows():
        return False, "Starting with the system is only wired up for Windows."
    try:
        import winreg  # type: ignore[import-not-found]

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                if getattr(sys, "frozen", False):
                    # A packaged build is its own launcher.
                    command = f'"{Path(sys.executable).resolve()}"'
                else:
                    launcher = Path(sys.executable)
                    # pythonw.exe starts the app without a console window.
                    windowless = launcher.with_name("pythonw.exe")
                    if windowless.exists():
                        launcher = windowless
                    main_py = Path(__file__).resolve().parents[2] / "main.py"
                    command = f'"{launcher}" "{main_py}"'
                winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, command)
                return True, "Mairo will start when you sign in to Windows."
            try:
                winreg.DeleteValue(key, app_name)
            except FileNotFoundError:
                pass
            return True, "Mairo will no longer start with Windows."
    except OSError as exc:
        log.warning("Startup registry update failed: %s", exc)
        return False, f"Could not update the Windows startup entry: {exc}"
