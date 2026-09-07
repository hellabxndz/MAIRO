"""System volume control.

Uses pycaw on Windows when it is available (it gives an exact percentage) and
falls back to the media keys, which need no extra packages. On other platforms
it tries the usual command line mixers so development off Windows still works.
"""

from __future__ import annotations

import subprocess
from typing import Optional

from app.utils.logging_setup import get_logger
from app.utils.platform_utils import is_macos, is_windows, which

log = get_logger("audio")

VK_VOLUME_MUTE = 0xAD
VK_VOLUME_DOWN = 0xAE
VK_VOLUME_UP = 0xAF


def _windows_endpoint():
    """Return the default speaker endpoint via pycaw, or None."""
    try:
        from comtypes import CLSCTX_ALL  # type: ignore[import-not-found]
        from ctypes import cast, POINTER
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume  # type: ignore[import-not-found]

        import comtypes  # type: ignore[import-not-found]

        comtypes.CoInitialize()
        speakers = AudioUtilities.GetSpeakers()
        interface = speakers.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        return cast(interface, POINTER(IAudioEndpointVolume))
    except Exception as exc:  # pycaw missing, or no audio device
        log.debug("pycaw unavailable: %s", exc)
        return None


def _tap_key(code: int, times: int = 1) -> bool:
    try:
        import ctypes

        for _ in range(times):
            ctypes.windll.user32.keybd_event(code, 0, 0, 0)  # type: ignore[attr-defined]
            ctypes.windll.user32.keybd_event(code, 0, 2, 0)  # type: ignore[attr-defined]
        return True
    except Exception as exc:
        log.warning("Media key press failed: %s", exc)
        return False


def get_volume() -> Optional[int]:
    """Current output volume as 0-100, or None when it cannot be read."""
    if is_windows():
        endpoint = _windows_endpoint()
        if endpoint is not None:
            try:
                return round(endpoint.GetMasterVolumeLevelScalar() * 100)
            except Exception:
                return None
        return None
    if is_macos():
        try:
            out = subprocess.run(
                ["osascript", "-e", "output volume of (get volume settings)"],
                capture_output=True, text=True, timeout=5,
            )
            return int(out.stdout.strip())
        except Exception:
            return None
    if which("pactl"):
        try:
            out = subprocess.run(
                ["pactl", "get-sink-volume", "@DEFAULT_SINK@"],
                capture_output=True, text=True, timeout=5,
            )
            for part in out.stdout.split():
                if part.endswith("%"):
                    return int(part.rstrip("%"))
        except Exception:
            return None
    return None


def set_volume(level: int) -> tuple[bool, str]:
    """Set output volume to a 0-100 level."""
    level = max(0, min(100, int(level)))
    if is_windows():
        endpoint = _windows_endpoint()
        if endpoint is not None:
            try:
                endpoint.SetMasterVolumeLevelScalar(level / 100.0, None)
                if level > 0:
                    endpoint.SetMute(0, None)
                return True, f"Volume set to {level} percent."
            except Exception as exc:
                log.warning("pycaw set volume failed: %s", exc)
        # Without pycaw, step the media keys: 50 taps covers the full range.
        if _tap_key(VK_VOLUME_DOWN, 50):
            steps = round(level / 2)
            if steps:
                _tap_key(VK_VOLUME_UP, steps)
            return True, f"Volume set to about {level} percent."
        return False, "The volume could not be changed on this computer."
    if is_macos():
        try:
            subprocess.run(["osascript", "-e", f"set volume output volume {level}"], timeout=5)
            return True, f"Volume set to {level} percent."
        except Exception as exc:
            return False, f"The volume could not be changed: {exc}"
    if which("pactl"):
        try:
            subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{level}%"], timeout=5)
            return True, f"Volume set to {level} percent."
        except Exception as exc:
            return False, f"The volume could not be changed: {exc}"
    return False, "Volume control is not available on this system."


def adjust_volume(delta: int) -> tuple[bool, str]:
    """Raise or lower the volume by a number of percentage points."""
    current = get_volume()
    if current is not None:
        return set_volume(current + delta)
    if is_windows():
        code = VK_VOLUME_UP if delta > 0 else VK_VOLUME_DOWN
        taps = max(1, round(abs(delta) / 2))
        if _tap_key(code, taps):
            direction = "up" if delta > 0 else "down"
            return True, f"Turned the volume {direction}."
    return False, "The volume could not be changed on this computer."


def set_mute(muted: bool) -> tuple[bool, str]:
    if is_windows():
        endpoint = _windows_endpoint()
        if endpoint is not None:
            try:
                endpoint.SetMute(1 if muted else 0, None)
                return True, "Sound muted." if muted else "Sound unmuted."
            except Exception as exc:
                log.warning("pycaw mute failed: %s", exc)
        if _tap_key(VK_VOLUME_MUTE):
            return True, "Mute toggled."
        return False, "Mute could not be changed on this computer."
    if is_macos():
        flag = "true" if muted else "false"
        try:
            subprocess.run(["osascript", "-e", f"set volume output muted {flag}"], timeout=5)
            return True, "Sound muted." if muted else "Sound unmuted."
        except Exception as exc:
            return False, f"Mute could not be changed: {exc}"
    if which("pactl"):
        try:
            subprocess.run(
                ["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1" if muted else "0"], timeout=5
            )
            return True, "Sound muted." if muted else "Sound unmuted."
        except Exception as exc:
            return False, f"Mute could not be changed: {exc}"
    return False, "Mute is not available on this system."


def is_muted() -> Optional[bool]:
    if is_windows():
        endpoint = _windows_endpoint()
        if endpoint is not None:
            try:
                return bool(endpoint.GetMute())
            except Exception:
                return None
    return None
