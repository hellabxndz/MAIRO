"""macOS behaviour, exercised from any platform.

Mairo is built on Windows first, so the Mac paths are the ones most likely to
rot. These drive them with the platform check and the shell calls replaced,
so they run on the build machine.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-mac-tests-"))

from app.config.settings import Settings  # noqa: E402
from app.tools import apps  # noqa: E402
from app.voice import tts_system  # noqa: E402


class as_macos:
    """Pretend the current machine is a Mac, for the modules under test."""

    def __init__(self, *modules):
        self.modules = modules

    def __enter__(self):
        self._saved = []
        for module in self.modules:
            self._saved.append((module, module.is_macos, getattr(module, "is_windows", None)))
            module.is_macos = lambda: True
            if hasattr(module, "is_windows"):
                module.is_windows = lambda: False
        return self

    def __exit__(self, *exc):
        for module, macos, windows in self._saved:
            module.is_macos = macos
            if windows is not None:
                module.is_windows = windows
        return False


class LaunchingTests(unittest.TestCase):
    def setUp(self):
        self.opened: list[str] = []
        self._real_open = apps.open_macos_app
        self._real_which = apps.which
        apps.open_macos_app = self._fake_open
        apps.which = lambda command: None  # nothing on PATH

    def tearDown(self):
        apps.open_macos_app = self._real_open
        apps.which = self._real_which

    def _fake_open(self, *_args):
        raise AssertionError("replaced per test")

    def _installed(self, *available):
        def opener(app_name):
            self.opened.append(app_name)
            return app_name in available

        apps.open_macos_app = opener

    def test_known_apps_use_their_mac_names(self):
        self._installed("Google Chrome")
        with as_macos(apps):
            result = apps.launch_named_app("chrome")
        self.assertTrue(result.ok)
        self.assertIn("Google Chrome", self.opened)

    def test_vs_code_and_spotify_resolve(self):
        for spoken, expected in [("vscode", "Visual Studio Code"), ("spotify", "Spotify")]:
            self.opened.clear()
            self._installed(expected)
            with as_macos(apps):
                result = apps.launch_named_app(spoken)
            self.assertTrue(result.ok, spoken)
            self.assertIn(expected, self.opened)

    def test_windows_names_map_to_the_mac_equivalent(self):
        """Asking for Task Manager on a Mac should open Activity Monitor."""
        self._installed("Activity Monitor")
        with as_macos(apps):
            result = apps.launch_named_app("task manager")
        self.assertTrue(result.ok)
        self.assertIn("Activity Monitor", self.opened)

    def test_an_unlisted_app_is_still_tried_by_name(self):
        self._installed("Notion")
        with as_macos(apps):
            result = apps.launch_named_app("notion")
        self.assertTrue(result.ok)

    def test_a_missing_app_reports_readably(self):
        self._installed()  # nothing installed
        with as_macos(apps):
            result = apps.launch_named_app("spotify")
        self.assertFalse(result.ok)
        self.assertIn("could not be found", result.message)

    def test_a_path_is_still_refused_on_a_mac(self):
        self._installed("anything")
        with as_macos(apps):
            result = apps.launch_named_app("/Applications/Evil.app")
        self.assertFalse(result.ok)
        self.assertIn("open_path", result.message)


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings()
        self.settings.speech_rate = 190
        self.calls: list[list[str]] = []
        self._real_popen = tts_system.subprocess.Popen
        self._real_run = tts_system.subprocess.run
        self._real_which = tts_system.shutil.which

    def tearDown(self):
        tts_system.subprocess.Popen = self._real_popen
        tts_system.subprocess.run = self._real_run
        tts_system.shutil.which = self._real_which

    def _capture_popen(self):
        outer = self

        class FakeProcess:
            def __init__(self, command, **kwargs):
                outer.calls.append(command)
                self.terminated = False

            def wait(self):
                return 0

            def terminate(self):
                self.terminated = True

        tts_system.subprocess.Popen = FakeProcess

    def test_it_speaks_through_say(self):
        self._capture_popen()
        with as_macos(tts_system):
            tts_system.SystemTextToSpeech(self.settings).speak("Systems nominal.")
        self.assertEqual(len(self.calls), 1)
        command = self.calls[0]
        self.assertEqual(command[0], "say")
        self.assertIn("-r", command)
        self.assertIn("190", command)
        self.assertEqual(command[-1], "Systems nominal.")

    def test_a_chosen_voice_is_passed_through(self):
        self._capture_popen()
        self.settings.tts_voice = "Samantha"
        with as_macos(tts_system):
            tts_system.SystemTextToSpeech(self.settings).speak("Hello.")
        command = self.calls[0]
        self.assertIn("-v", command)
        self.assertIn("Samantha", command)

    def test_the_default_voice_is_left_to_the_system(self):
        self._capture_popen()
        self.settings.tts_voice = ""
        with as_macos(tts_system):
            tts_system.SystemTextToSpeech(self.settings).speak("Hello.")
        self.assertNotIn("-v", self.calls[0])

    def test_empty_text_is_not_spoken(self):
        self._capture_popen()
        with as_macos(tts_system):
            tts_system.SystemTextToSpeech(self.settings).speak("   ")
        self.assertEqual(self.calls, [])

    def test_voices_are_parsed_from_say(self):
        listing = (
            "Alex                en_US    # Most people recognize me by my voice.\n"
            "Bad News            en_US    # The light you see at the end of the tunnel.\n"
            "Samantha            en_US    # Hello, my name is Samantha.\n"
        )
        tts_system.subprocess.run = lambda *a, **k: types.SimpleNamespace(
            stdout=listing, returncode=0
        )
        with as_macos(tts_system):
            voices = tts_system.SystemTextToSpeech(self.settings).voices()
        ids = [voice.id for voice in voices]
        self.assertIn("Alex", ids)
        self.assertIn("Samantha", ids)
        self.assertIn("Bad News", ids, "voice names with spaces must survive parsing")
        self.assertTrue(all("#" not in voice.label for voice in voices))

    def test_availability_follows_the_say_command(self):
        tts_system.shutil.which = lambda name: "/usr/bin/say"
        with as_macos(tts_system):
            self.assertTrue(tts_system.SystemTextToSpeech(self.settings).is_available())
        tts_system.shutil.which = lambda name: None
        with as_macos(tts_system):
            self.assertFalse(tts_system.SystemTextToSpeech(self.settings).is_available())

    def test_stopping_kills_the_speech(self):
        self._capture_popen()
        provider = tts_system.SystemTextToSpeech(self.settings)
        with as_macos(tts_system):
            provider.speak("A long sentence.")
        provider.stop()  # must not raise once the process has finished

    def test_a_broken_say_is_a_readable_error(self):
        def explode(*args, **kwargs):
            raise OSError("say is missing")

        tts_system.subprocess.Popen = explode
        with as_macos(tts_system):
            with self.assertRaises(tts_system.VoiceError) as caught:
                tts_system.SystemTextToSpeech(self.settings).speak("Hello.")
        self.assertIn("Spoken Content", caught.exception.hint)


class DependencyTests(unittest.TestCase):
    def test_windows_only_packages_are_marked_as_such(self):
        """A Mac install must not try to fetch pywin32, pycaw or comtypes."""
        requirements = (ROOT / "requirements.txt").read_text()
        for line in requirements.splitlines():
            entry = line.split("#")[0].strip()
            if not entry:
                continue
            name = entry.split(";")[0].strip().lower()
            if any(name.startswith(pkg) for pkg in ("pywin32", "pycaw", "comtypes")):
                self.assertIn('sys_platform == "win32"', entry, entry)


if __name__ == "__main__":
    unittest.main(verbosity=2)
