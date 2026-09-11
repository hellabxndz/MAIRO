"""Tests for music playback.

The real Windows media APIs are not here, so the session objects are faked at
the seam where Mairo talks to them. What matters is the logic on Mairo's side:
which player gets aimed at, what the user is told, and — the one that could
genuinely annoy someone — that Mairo never presses play on the wrong track.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-music-tests-"))

from app.tools import music  # noqa: E402
from app.tools.base import ToolContext  # noqa: E402
from app.utils import apple_music, media_control  # noqa: E402
from app.utils import platform_utils  # noqa: E402

APPLE_ID = "AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"
SPOTIFY_ID = "Spotify.exe"


class FakeOperation:
    """Stands in for a WinRT IAsyncOperation, which resolves with .get()."""

    def __init__(self, value):
        self.value = value

    def get(self):
        return self.value


class FakeProperties:
    def __init__(self, title, artist, album):
        self.title = title
        self.artist = artist
        self.album_title = album


class FakeInfo:
    def __init__(self, status, shuffle=None):
        self.playback_status = status
        self.is_shuffle_active = shuffle


class FakeSession:
    """A media session that records what was asked of it."""

    def __init__(self, app_id, title="Song", artist="Artist", album="Album", status=4):
        self.source_app_user_model_id = app_id
        self._properties = FakeProperties(title, artist, album)
        self._info = FakeInfo(status)
        self.calls: list[str] = []
        self.answer = True
        self.shuffle_requested = None
        self.repeat_requested = None

    def try_get_media_properties_async(self):
        return FakeOperation(self._properties)

    def get_playback_info(self):
        return self._info

    def _record(self, name):
        self.calls.append(name)
        return FakeOperation(self.answer)

    def try_play_async(self):
        return self._record("play")

    def try_pause_async(self):
        return self._record("pause")

    def try_toggle_play_pause_async(self):
        return self._record("play_pause")

    def try_skip_next_async(self):
        return self._record("next")

    def try_skip_previous_async(self):
        return self._record("previous")

    def try_stop_async(self):
        return self._record("stop")

    def try_change_shuffle_active_async(self, state):
        self.shuffle_requested = state
        return self._record("shuffle")

    def try_change_auto_repeat_mode_async(self, mode):
        self.repeat_requested = mode
        return self._record("repeat")


class FakeManager:
    def __init__(self, sessions, current=None):
        self._sessions = sessions
        self._current = current if current is not None else (sessions[0] if sessions else None)

    def get_sessions(self):
        return self._sessions

    def get_current_session(self):
        return self._current


class SessionPickingTests(unittest.TestCase):
    """Which player an action is aimed at."""

    def setUp(self):
        self.apple = FakeSession(APPLE_ID, title="Redbone", artist="Childish Gambino")
        self.spotify = FakeSession(SPOTIFY_ID, title="Other", artist="Someone")
        self._manager = media_control._manager
        media_control._manager = lambda: FakeManager([self.spotify, self.apple], self.spotify)

    def tearDown(self):
        media_control._manager = self._manager

    def test_apple_music_is_found_by_hint(self):
        session = media_control.find_session(media_control.APPLE_MUSIC_HINTS)
        self.assertIs(session, self.apple)

    def test_spotify_hint_finds_spotify(self):
        self.assertIs(media_control.find_session(("spotify",)), self.spotify)

    def test_no_hint_uses_the_current_session(self):
        self.assertIs(media_control.find_session(None), self.spotify)

    def test_unknown_hint_finds_nothing(self):
        self.assertIsNone(media_control.find_session(("winamp",)))

    def test_auto_prefers_apple_music_when_it_has_something_open(self):
        self.assertEqual(music._hints_for("auto"), media_control.APPLE_MUSIC_HINTS)

    def test_named_player_wins_over_auto(self):
        self.assertEqual(music._hints_for("spotify"), ("spotify",))

    def test_any_means_whatever_has_focus(self):
        self.assertIsNone(music._hints_for("any"))

    def test_app_names_are_readable(self):
        self.assertEqual(media_control._friendly_app(APPLE_ID), "Apple Music")
        self.assertEqual(media_control._friendly_app(SPOTIFY_ID), "Spotify")


class NowPlayingTests(unittest.TestCase):
    def setUp(self):
        self.apple = FakeSession(APPLE_ID, title="Redbone", artist="Childish Gambino", album="Awaken")
        self._manager = media_control._manager
        media_control._manager = lambda: FakeManager([self.apple])
        self.tool = music.NowPlayingTool(ToolContext(settings=None, memory=None, db=None))

    def tearDown(self):
        media_control._manager = self._manager

    def test_reports_the_track(self):
        result = self.tool.run({})
        self.assertTrue(result.ok)
        self.assertIn("Redbone", result.message)
        self.assertIn("Childish Gambino", result.message)
        self.assertIn("Apple Music", result.message)
        self.assertEqual(result.data["status"], "playing")

    def test_paused_is_said_plainly(self):
        self.apple._info.playback_status = 5
        result = self.tool.run({})
        self.assertTrue(result.ok)
        self.assertIn("paused", result.message)

    def test_nothing_playing_is_not_a_crash(self):
        media_control._manager = lambda: FakeManager([])
        result = self.tool.run({})
        self.assertFalse(result.ok)
        self.assertIn("Nothing is playing", result.message)

    def test_missing_support_explains_itself(self):
        media_control._manager = lambda: None
        result = self.tool.run({})
        self.assertFalse(result.ok)
        self.assertIn("winrt", result.message)


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.apple = FakeSession(APPLE_ID)
        self._manager = media_control._manager
        self._tap = platform_utils.tap_virtual_key
        media_control._manager = lambda: FakeManager([self.apple])
        self.tool = music.ControlMusicTool(ToolContext(settings=None, memory=None, db=None))

    def tearDown(self):
        media_control._manager = self._manager
        media_control.tap_virtual_key = self._tap

    def test_pause_reaches_the_player(self):
        result = self.tool.run({"action": "pause"})
        self.assertTrue(result.ok)
        self.assertEqual(self.apple.calls, ["pause"])

    def test_skip_reaches_the_player(self):
        result = self.tool.run({"action": "next"})
        self.assertTrue(result.ok)
        self.assertEqual(self.apple.calls, ["next"])
        self.assertIn("next track", result.message)

    def test_shuffle_on(self):
        result = self.tool.run({"action": "shuffle_on"})
        self.assertTrue(result.ok)
        self.assertIs(self.apple.shuffle_requested, True)

    def test_unknown_action_is_refused(self):
        result = self.tool.run({"action": "teleport"})
        self.assertFalse(result.ok)
        self.assertEqual(self.apple.calls, [])

    def test_media_keys_are_the_fallback(self):
        media_control._manager = lambda: None
        pressed = []
        media_control.tap_virtual_key = lambda code, times=1: pressed.append(code) or True
        media_control.is_windows = lambda: True
        try:
            result = self.tool.run({"action": "next"})
        finally:
            media_control.is_windows = platform_utils.is_windows
        self.assertTrue(result.ok)
        self.assertEqual(pressed, [media_control.VK_MEDIA_NEXT])
        self.assertIn("media keys", result.message)

    def test_no_player_at_all_fails_clearly(self):
        media_control._manager = lambda: None
        media_control.tap_virtual_key = lambda code, times=1: False
        result = self.tool.run({"action": "pause"})
        self.assertFalse(result.ok)
        self.assertIn("could not reach", result.message)


class CatalogueSearchTests(unittest.TestCase):
    """The Apple Music lookup, with the network faked out."""

    def setUp(self):
        self._urlopen = apple_music.urllib.request.urlopen

    def tearDown(self):
        apple_music.urllib.request.urlopen = self._urlopen

    def _respond(self, payload):
        class Response:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *args):
                return False

            def read(self_inner):
                return json.dumps(payload).encode()

        apple_music.urllib.request.urlopen = lambda request, timeout=None: Response()

    def test_finds_a_song(self):
        self._respond(
            {
                "results": [
                    {
                        "trackName": "Redbone",
                        "artistName": "Childish Gambino",
                        "trackViewUrl": "https://music.apple.com/us/album/redbone/1?i=2",
                    }
                ]
            }
        )
        match = apple_music.search("redbone")
        self.assertIsNotNone(match)
        self.assertEqual(match.title, "Redbone")
        self.assertEqual(match.describe(), "Redbone by Childish Gambino")

    def test_no_results_is_none(self):
        self._respond({"results": []})
        self.assertIsNone(apple_music.search("asdkjhasd"))

    def test_network_trouble_is_none_not_an_exception(self):
        def boom(request, timeout=None):
            raise OSError("no network")

        apple_music.urllib.request.urlopen = boom
        self.assertIsNone(apple_music.search("anything"))

    def test_non_https_links_are_ignored(self):
        self._respond(
            {"results": [{"trackName": "X", "artistName": "Y", "trackViewUrl": "javascript:alert(1)"}]}
        )
        self.assertIsNone(apple_music.search("x"))

    def test_empty_query_never_reaches_the_network(self):
        def boom(request, timeout=None):
            raise AssertionError("should not have searched")

        apple_music.urllib.request.urlopen = boom
        self.assertIsNone(apple_music.search("   "))


class PlayAppleMusicTests(unittest.TestCase):
    def setUp(self):
        self.opened: list[str] = []
        self.apple = FakeSession(APPLE_ID, title="Redbone", artist="Childish Gambino", status=5)
        self._manager = media_control._manager
        self._search = apple_music.search
        self._open = music.open_path
        self._timings = (music.POLL_SECONDS, music.OPEN_WAIT_SECONDS)
        media_control._manager = lambda: FakeManager([self.apple])
        music.open_path = self.opened.append
        music.POLL_SECONDS = 0.01
        music.OPEN_WAIT_SECONDS = 0.2
        self.tool = music.PlayAppleMusicTool(ToolContext(settings=None, memory=None, db=None))

    def tearDown(self):
        media_control._manager = self._manager
        apple_music.search = self._search
        music.open_path = self._open
        music.POLL_SECONDS, music.OPEN_WAIT_SECONDS = self._timings

    def _match(self, title="Redbone"):
        return apple_music.Match(
            kind="song", title=title, artist="Childish Gambino", url="https://music.apple.com/x"
        )

    def test_opens_the_link_and_presses_play(self):
        apple_music.search = lambda query, kind="song", country="US": self._match()
        result = self.tool.run({"query": "redbone"})
        self.assertTrue(result.ok)
        self.assertEqual(self.opened, ["https://music.apple.com/x"])
        self.assertIn("play", self.apple.calls)
        self.assertIn("Playing", result.message)

    def test_never_plays_a_different_track(self):
        """The app may still be on the last thing; pressing play would be wrong."""
        apple_music.search = lambda query, kind="song", country="US": self._match("Something Else")
        result = self.tool.run({"query": "something else"})
        self.assertTrue(result.ok)
        self.assertEqual(self.apple.calls, [])
        self.assertIn("Press play", result.message)

    def test_already_playing_is_left_alone(self):
        self.apple._info.playback_status = 4
        apple_music.search = lambda query, kind="song", country="US": self._match()
        result = self.tool.run({"query": "redbone"})
        self.assertTrue(result.ok)
        self.assertEqual(self.apple.calls, [])
        self.assertIn("Playing", result.message)

    def test_nothing_found_is_reported(self):
        apple_music.search = lambda query, kind="song", country="US": None
        result = self.tool.run({"query": "zzzz"})
        self.assertFalse(result.ok)
        self.assertEqual(self.opened, [])

    def test_empty_query_is_refused(self):
        result = self.tool.run({"query": "  "})
        self.assertFalse(result.ok)
        self.assertEqual(self.opened, [])


class StoreLauncherTests(unittest.TestCase):
    """The Start menu lookup interpolates a name, so it checks the name."""

    def test_odd_names_are_refused(self):
        original = platform_utils.is_windows
        platform_utils.is_windows = lambda: True
        try:
            for name in ("Apple'; Remove-Item C:\\ #", "Music$(bad)", "", "a|b"):
                self.assertFalse(platform_utils.open_windows_store_app(name), name)
        finally:
            platform_utils.is_windows = original

    @unittest.skipIf(platform_utils.is_windows(), "would really open the app")
    def test_nothing_runs_off_windows(self):
        self.assertFalse(platform_utils.open_windows_store_app("Apple Music"))


class RegistrationTests(unittest.TestCase):
    def test_music_tools_are_registered(self):
        from app.config.settings import Settings
        from app.database.db import Database
        from app.memory.memory_store import MemoryStore
        from app.tools.registry import build_default_registry

        settings = Settings()
        database = Database(Path(os.environ["MAIRO_HOME"]) / "music-tests.db")
        memory = MemoryStore(database)
        registry = build_default_registry(
            ToolContext(settings=settings, memory=memory, db=database)
        )
        for name in ("now_playing", "control_music", "play_apple_music", "launch_apple_music"):
            self.assertIsNotNone(registry.get(name), name)


if __name__ == "__main__":
    unittest.main()
