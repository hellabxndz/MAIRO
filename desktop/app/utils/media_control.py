"""Reading and steering whatever is playing music on this computer.

Windows publishes a transport-control session for every app that plays media —
Apple Music, Spotify, a browser tab — through ``Windows.Media.Control``.
Talking to that session is the same thing as pressing the play button on the
keyboard or clicking it in the app: it needs no account, no API key and no
password, and it only reaches apps the user has already opened and signed into
themselves.

The WinRT projection behind it is an optional install. Without it Mairo falls
back to the media keys, which every Windows machine understands but which
cannot say what is playing or aim at one app in particular.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Optional, Sequence

from app.utils.logging_setup import get_logger
from app.utils.platform_utils import is_windows, tap_virtual_key

log = get_logger("media")

# Apple Music and the older iTunes both identify themselves through the app
# model id; matching on a squashed form of it survives version suffixes.
APPLE_MUSIC_HINTS = ("applemusic", "itunes")

VK_MEDIA_NEXT = 0xB0
VK_MEDIA_PREVIOUS = 0xB1
VK_MEDIA_STOP = 0xB2
VK_MEDIA_PLAY_PAUSE = 0xB3

# session method for each spoken action, and the keyboard key that stands in
# for it when the WinRT projection is not installed.
_SESSION_METHODS = {
    "play": "try_play_async",
    "pause": "try_pause_async",
    "play_pause": "try_toggle_play_pause_async",
    "next": "try_skip_next_async",
    "previous": "try_skip_previous_async",
    "stop": "try_stop_async",
}
_MEDIA_KEYS = {
    "play": VK_MEDIA_PLAY_PAUSE,
    "pause": VK_MEDIA_PLAY_PAUSE,
    "play_pause": VK_MEDIA_PLAY_PAUSE,
    "next": VK_MEDIA_NEXT,
    "previous": VK_MEDIA_PREVIOUS,
    "stop": VK_MEDIA_STOP,
}

ACTIONS = tuple(_SESSION_METHODS)

_STATUS_NAMES = {0: "closed", 1: "opened", 2: "changing", 3: "stopped", 4: "playing", 5: "paused"}

_apartment_threads: set[int] = set()
_apartment_lock = threading.Lock()


@dataclass
class Track:
    """What one media session is currently showing on its player."""

    title: str
    artist: str
    album: str
    status: str
    app: str
    shuffle: Optional[bool] = None

    @property
    def is_playing(self) -> bool:
        return self.status == "playing"

    def describe(self) -> str:
        parts = self.title or "Something untitled"
        if self.artist:
            parts += f" by {self.artist}"
        if self.album and self.album != self.title:
            parts += f" (from {self.album})"
        return parts


def _init_apartment() -> None:
    """COM wants initialising once per thread; tool calls arrive on workers."""
    ident = threading.get_ident()
    with _apartment_lock:
        if ident in _apartment_threads:
            return
        _apartment_threads.add(ident)
    try:
        from winrt.runtime import init_apartment  # type: ignore[import-not-found]

        init_apartment()
    except Exception as exc:  # already initialised, or the package is absent
        log.debug("Apartment init skipped: %s", exc)


def _manager() -> Any:
    """The system's media session manager, or None when it is unreachable."""
    if not is_windows():
        return None
    try:
        _init_apartment()
        from winrt.windows.media.control import (  # type: ignore[import-not-found]
            GlobalSystemMediaTransportControlsSessionManager as Manager,
        )

        return Manager.request_async().get()
    except ImportError as exc:
        log.debug("WinRT media control not installed: %s", exc)
    except Exception as exc:
        log.warning("Media session manager unavailable: %s", exc)
    return None


def available() -> bool:
    """True when Mairo can read and target individual players."""
    return _manager() is not None


def _squash(text: str) -> str:
    return "".join(ch for ch in (text or "").lower() if ch.isalnum())


def _friendly_app(app_id: str) -> str:
    squashed = _squash(app_id)
    if "applemusic" in squashed:
        return "Apple Music"
    if "itunes" in squashed:
        return "iTunes"
    if "spotify" in squashed:
        return "Spotify"
    # AppleInc.AppleMusicWin_abc!App -> AppleMusicWin; chrome.exe -> chrome
    name = (app_id or "").split("!")[0].split("_")[0].split(".")[-1]
    return name or "the player"


def find_session(hints: Sequence[str] | None = None) -> Any:
    """A player's session: the one matching `hints`, else whichever has focus."""
    manager = _manager()
    if manager is None:
        return None
    try:
        sessions = list(manager.get_sessions() or [])
    except Exception as exc:
        log.warning("Could not list media sessions: %s", exc)
        sessions = []
    if hints:
        wanted = [_squash(hint) for hint in hints if hint]
        for session in sessions:
            try:
                app_id = _squash(session.source_app_user_model_id)
            except Exception:
                continue
            if any(hint and hint in app_id for hint in wanted):
                return session
        return None
    try:
        return manager.get_current_session()
    except Exception as exc:
        log.warning("No current media session: %s", exc)
        return None


def now_playing(hints: Sequence[str] | None = None) -> Optional[Track]:
    """Read the current track from a player, or None when nothing is there."""
    session = find_session(hints)
    if session is None:
        return None
    try:
        properties = session.try_get_media_properties_async().get()
        info = session.get_playback_info()
    except Exception as exc:
        log.warning("Could not read media properties: %s", exc)
        return None
    if properties is None:
        return None
    try:
        status = _STATUS_NAMES.get(int(info.playback_status), "unknown")
    except Exception:
        status = "unknown"
    try:
        shuffle = info.is_shuffle_active
    except Exception:
        shuffle = None
    try:
        app = _friendly_app(session.source_app_user_model_id)
    except Exception:
        app = "the player"
    return Track(
        title=properties.title or "",
        artist=properties.artist or "",
        album=properties.album_title or "",
        status=status,
        app=app,
        shuffle=shuffle,
    )


def send(action: str, hints: Sequence[str] | None = None) -> tuple[bool, str]:
    """Run a transport action. Returns (worked, how it was done)."""
    if action not in _SESSION_METHODS:
        return False, f"“{action}” is not a playback action Mairo knows."

    session = find_session(hints)
    if session is not None:
        try:
            if getattr(session, _SESSION_METHODS[action])().get():
                return True, "player"
            log.info("Player refused %s", action)
        except Exception as exc:
            log.warning("Sending %s to the player failed: %s", action, exc)

    if is_windows() and tap_virtual_key(_MEDIA_KEYS[action]):
        return True, "keys"

    if hints and session is None and available():
        return False, "That player does not have anything open right now."
    return False, "Mairo could not reach a media player on this computer."


def set_shuffle(on: bool, hints: Sequence[str] | None = None) -> tuple[bool, str]:
    session = find_session(hints)
    if session is None:
        return False, "Mairo could not find a player to shuffle."
    try:
        if session.try_change_shuffle_active_async(bool(on)).get():
            return True, "player"
    except Exception as exc:
        log.warning("Shuffle change failed: %s", exc)
    return False, "That player would not change its shuffle setting."


def set_repeat(mode: str, hints: Sequence[str] | None = None) -> tuple[bool, str]:
    """mode is 'off', 'one' or 'all'."""
    session = find_session(hints)
    if session is None:
        return False, "Mairo could not find a player to set repeat on."
    try:
        from winrt.windows.media import (  # type: ignore[import-not-found]
            MediaPlaybackAutoRepeatMode,
        )

        wanted = {
            "off": MediaPlaybackAutoRepeatMode.NONE,
            "one": MediaPlaybackAutoRepeatMode.TRACK,
            "all": MediaPlaybackAutoRepeatMode.LIST,
        }[mode]
    except ImportError:
        return False, "Repeat needs the winrt-Windows.Media package, which is not installed."
    except KeyError:
        return False, "Repeat can be 'off', 'one' or 'all'."
    try:
        if session.try_change_auto_repeat_mode_async(wanted).get():
            return True, "player"
    except Exception as exc:
        log.warning("Repeat change failed: %s", exc)
    return False, "That player would not change its repeat setting."
