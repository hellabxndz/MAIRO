"""Music playback: what is playing, transport controls, and Apple Music.

These actions drive a player the user already has open and signed in — the
same thing the media keys on a keyboard do. Nothing here reads an account,
a password or a library; searching the Apple Music catalogue sends only the
words the user asked for.
"""

from __future__ import annotations

import time
from typing import Any, Optional, Sequence

from app.tools.base import Tool, ToolResult
from app.utils import apple_music, media_control
from app.utils.logging_setup import get_logger
from app.utils.platform_utils import open_path

log = get_logger("tools.music")

PLAYERS = {
    "apple music": media_control.APPLE_MUSIC_HINTS,
    "spotify": ("spotify",),
    "any": None,
}

# How long to wait for the Apple Music app to come up and load a track that
# was just opened from a link, before giving up on starting it automatically.
OPEN_WAIT_SECONDS = 8.0
POLL_SECONDS = 0.5


def _hints_for(player: str | None) -> Optional[Sequence[str]]:
    """Turn a spoken player name into session hints.

    "auto" prefers Apple Music when it has something open and otherwise lets
    Windows decide, which is normally whichever player was used last.
    """
    chosen = (player or "auto").strip().lower()
    if chosen in PLAYERS:
        return PLAYERS[chosen]
    if media_control.find_session(media_control.APPLE_MUSIC_HINTS) is not None:
        return media_control.APPLE_MUSIC_HINTS
    return None


def _player_argument() -> dict[str, Any]:
    return {
        "type": "string",
        "enum": ["auto", "apple music", "spotify", "any"],
        "description": "Which player to aim at. Leave as 'auto' unless the user named one.",
    }


class NowPlayingTool(Tool):
    name = "now_playing"
    description = (
        "Report the track currently playing on this computer — title, artist, album and "
        "whether it is playing or paused. Works with Apple Music, Spotify and browser players."
    )
    parameters = {
        "type": "object",
        "properties": {"player": _player_argument()},
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        player = str(args.get("player") or "auto")
        track = media_control.now_playing(_hints_for(player))
        if track is None:
            if not media_control.available():
                return ToolResult.failure(
                    "Mairo cannot read what is playing on this computer. On Windows that "
                    "needs the winrt-Windows.Media.Control package; elsewhere it is not "
                    "supported yet."
                )
            return ToolResult.failure("Nothing is playing right now.")
        state = "playing" if track.is_playing else track.status
        return ToolResult.success(
            f"{track.app} is {state}: {track.describe()}.",
            title=track.title,
            artist=track.artist,
            album=track.album,
            status=track.status,
            app=track.app,
        )


class ControlMusicTool(Tool):
    name = "control_music"
    description = (
        "Control playback on a music player that is already open: play, pause, skip to the "
        "next or previous track, stop, or change shuffle and repeat. Use this for "
        "'play', 'pause', 'skip this song', 'shuffle my music'."
    )
    parameters = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "play",
                    "pause",
                    "play_pause",
                    "next",
                    "previous",
                    "stop",
                    "shuffle_on",
                    "shuffle_off",
                    "repeat_off",
                    "repeat_one",
                    "repeat_all",
                ],
                "description": "What to do to the player.",
            },
            "player": _player_argument(),
        },
        "required": ["action"],
    }

    WORDS = {
        "play": "Playing",
        "pause": "Paused",
        "play_pause": "Toggled playback",
        "next": "Skipped to the next track",
        "previous": "Went back a track",
        "stop": "Stopped playback",
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        action = str(args.get("action") or "").strip().lower()
        hints = _hints_for(str(args.get("player") or "auto"))

        if action.startswith("shuffle_"):
            ok, note = media_control.set_shuffle(action == "shuffle_on", hints)
            if not ok:
                return ToolResult.failure(note)
            return ToolResult.success(
                "Shuffle is on." if action == "shuffle_on" else "Shuffle is off."
            )

        if action.startswith("repeat_"):
            mode = action.removeprefix("repeat_")
            ok, note = media_control.set_repeat(mode, hints)
            if not ok:
                return ToolResult.failure(note)
            wording = {"off": "Repeat is off.", "one": "Repeating this track.", "all": "Repeating everything."}
            return ToolResult.success(wording[mode])

        if action not in media_control.ACTIONS:
            return ToolResult.failure(f"“{action}” is not a playback action Mairo knows.")

        ok, note = media_control.send(action, hints)
        if not ok:
            return ToolResult.failure(note)
        message = f"{self.WORDS[action]}."
        if note == "keys":
            # The keyboard's play key toggles, so say what was actually sent.
            message = (
                f"{self.WORDS[action]} using the media keys — Mairo could not read the "
                "player's state to confirm it."
            )
        return ToolResult.success(message)


class PlayAppleMusicTool(Tool):
    name = "play_apple_music"
    description = (
        "Find a song, album or artist in Apple Music and open it in the Apple Music app. "
        "Use this when the user names something they want to hear, e.g. 'play Blonde by "
        "Frank Ocean'. It needs the user's own Apple Music app and subscription."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to look for, e.g. 'Redbone Childish Gambino'.",
            },
            "kind": {
                "type": "string",
                "enum": ["song", "album", "artist"],
                "description": "What kind of thing was asked for. Defaults to song.",
            },
        },
        "required": ["query"],
    }

    def run(self, args: dict[str, Any]) -> ToolResult:
        query = str(args.get("query") or "").strip()
        if not query:
            return ToolResult.failure("Say what to play.")
        kind = str(args.get("kind") or "song").strip().lower()
        if kind not in apple_music.ENTITIES:
            kind = "song"

        match = apple_music.search(query, kind)
        if match is None:
            return ToolResult.failure(
                f"Apple Music has nothing matching “{query[:60]}”, or the catalogue could "
                "not be reached."
            )

        try:
            open_path(match.url)
        except OSError as exc:
            log.warning("Opening %s failed: %s", match.url, exc)
            return ToolResult.failure(f"{match.describe()} was found, but it would not open.")

        started = self._start_if_waiting(match)
        if started:
            return ToolResult.success(f"Playing {match.describe()} in Apple Music.", url=match.url)
        return ToolResult.success(
            f"Opened {match.describe()} in Apple Music. Press play if it does not start "
            "on its own.",
            url=match.url,
        )

    def _start_if_waiting(self, match: apple_music.Match) -> bool:
        """Press play only once Apple Music is showing the thing we opened.

        Opening a link makes the app load the page; whether it starts playing
        is up to the app. Waiting for the title to match first means Mairo can
        never start the wrong track, and does nothing at all when it cannot
        see the player.
        """
        if match.kind == "artist" or not media_control.available():
            return False
        wanted = _squashed(match.title)
        deadline = time.monotonic() + OPEN_WAIT_SECONDS
        while time.monotonic() < deadline:
            track = media_control.now_playing(media_control.APPLE_MUSIC_HINTS)
            if track is not None:
                if track.is_playing and _titles_match(track, wanted, match):
                    return True
                if track.status in ("paused", "stopped") and _titles_match(track, wanted, match):
                    ok, _ = media_control.send("play", media_control.APPLE_MUSIC_HINTS)
                    return ok
            time.sleep(POLL_SECONDS)
        return False


def _squashed(text: str) -> str:
    return "".join(ch for ch in (text or "").lower() if ch.isalnum())


def _titles_match(track: Any, wanted: str, match: apple_music.Match) -> bool:
    """True when the player is showing what was just opened."""
    if not wanted:
        return False
    candidates = [_squashed(track.title), _squashed(track.album)]
    return any(wanted in value or (value and value in wanted) for value in candidates)
