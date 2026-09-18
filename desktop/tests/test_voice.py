"""Tests for the speech layer: provider selection and each provider's edges.

Real microphones and speech services are not available on a build machine, so
the engines are replaced with stand-ins and the wiring around them is what is
checked here.
"""

from __future__ import annotations

import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-voice-tests-"))

from app.config.settings import Settings  # noqa: E402
from app.utils.errors import ConfigurationError, VoiceError  # noqa: E402
from app.voice.manager import VoiceManager  # noqa: E402
from app.voice.stt_google import GoogleSpeechToText  # noqa: E402
from app.voice.stt_openai import OpenAISpeechToText  # noqa: E402
from app.voice.tts_openai import DEFAULT_VOICE, OpenAITextToSpeech  # noqa: E402
from app.voice.tts_system import SystemTextToSpeech  # noqa: E402


class FakeEngine:
    def __init__(self):
        self.properties: dict = {}
        self.said: list[str] = []
        self.waited = False
        self.stopped = False

    def setProperty(self, name, value):  # noqa: N802 - mirrors pyttsx3
        self.properties[name] = value

    def getProperty(self, name):  # noqa: N802 - mirrors pyttsx3
        if name == "voices":
            voice = types.SimpleNamespace(id="voice-1", name="Test Voice")
            return [voice]
        return self.properties.get(name)

    def say(self, text):
        self.said.append(text)

    def runAndWait(self):  # noqa: N802 - mirrors pyttsx3
        self.waited = True

    def stop(self):
        self.stopped = True


class fake_module:
    """Installs a stand-in module for the duration of a block."""

    def __init__(self, name, module):
        self.name = name
        self.module = module

    def __enter__(self):
        self._previous = sys.modules.get(self.name)
        sys.modules[self.name] = self.module
        return self

    def __exit__(self, *exc):
        if self._previous is not None:
            sys.modules[self.name] = self._previous
        else:
            sys.modules.pop(self.name, None)
        return False


def pyttsx3_stub(engine, fail: bool = False):
    module = types.ModuleType("pyttsx3")

    def init(*args, **kwargs):
        if fail:
            raise RuntimeError("no voices installed")
        return engine

    module.init = init
    return module


class SystemVoiceTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings()
        self.settings.speech_rate = 205
        self.engine = FakeEngine()

    def test_it_speaks_with_the_configured_rate_and_voice(self):
        self.settings.tts_voice = "voice-1"
        with fake_module("pyttsx3", pyttsx3_stub(self.engine)):
            SystemTextToSpeech(self.settings).speak("Systems nominal.")
        self.assertEqual(self.engine.said, ["Systems nominal."])
        self.assertEqual(self.engine.properties["rate"], 205)
        self.assertEqual(self.engine.properties["voice"], "voice-1")
        self.assertTrue(self.engine.waited)

    def test_the_default_voice_is_left_to_the_system(self):
        self.settings.tts_voice = ""
        with fake_module("pyttsx3", pyttsx3_stub(self.engine)):
            SystemTextToSpeech(self.settings).speak("Hello.")
        self.assertNotIn("voice", self.engine.properties)

    def test_empty_text_is_not_spoken(self):
        with fake_module("pyttsx3", pyttsx3_stub(self.engine)):
            SystemTextToSpeech(self.settings).speak("   ")
        self.assertEqual(self.engine.said, [])

    def test_voices_are_listed_for_the_settings_screen(self):
        with fake_module("pyttsx3", pyttsx3_stub(self.engine)):
            voices = SystemTextToSpeech(self.settings).voices()
        self.assertEqual([v.id for v in voices], ["voice-1"])
        self.assertEqual(voices[0].label, "Test Voice")

    def test_no_installed_voice_is_a_readable_error(self):
        with fake_module("pyttsx3", pyttsx3_stub(self.engine, fail=True)):
            provider = SystemTextToSpeech(self.settings)
            self.assertFalse(provider.is_available())
            with self.assertRaises(VoiceError) as caught:
                provider.speak("Hello.")
        self.assertIn("add a voice", caught.exception.hint)
        self.assertIn("Speech", caught.exception.hint)

    def test_a_missing_package_is_a_readable_error(self):
        with fake_module("pyttsx3", None):  # importing None raises
            with self.assertRaises(VoiceError) as caught:
                SystemTextToSpeech(self.settings).speak("Hello.")
        self.assertIn("pyttsx3", caught.exception.message)


class OpenAIVoiceTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings()
        os.environ.pop("OPENAI_API_KEY", None)

    def tearDown(self):
        os.environ.pop("OPENAI_API_KEY", None)

    def test_it_needs_a_key(self):
        provider = OpenAITextToSpeech(self.settings)
        self.assertFalse(provider.is_available())
        with self.assertRaises(ConfigurationError) as caught:
            provider.speak("Hello.")
        self.assertIn("system voice", caught.exception.hint)

    def test_it_offers_named_voices(self):
        names = [voice.id for voice in OpenAITextToSpeech(self.settings).voices()]
        self.assertIn(DEFAULT_VOICE, names)
        self.assertTrue(all(name.islower() for name in names))

    def test_empty_text_never_reaches_the_service(self):
        os.environ["OPENAI_API_KEY"] = "sk-test-key-value"
        # No key check is reached because empty text returns first.
        OpenAITextToSpeech(self.settings).speak("")


class SpeechToTextTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings()
        os.environ.pop("OPENAI_API_KEY", None)

    def tearDown(self):
        os.environ.pop("OPENAI_API_KEY", None)

    def test_openai_recognition_needs_a_key(self):
        provider = OpenAISpeechToText(self.settings)
        self.assertFalse(provider.is_available())
        with self.assertRaises(ConfigurationError) as caught:
            provider.transcribe(Path("nothing.wav"))
        self.assertIn("Google", caught.exception.hint)

    def test_google_recognition_reports_whether_it_can_run(self):
        provider = GoogleSpeechToText(self.settings)
        self.assertIsInstance(provider.is_available(), bool)


class ManagerTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings()
        self.manager = VoiceManager(self.settings)

    def test_providers_follow_the_settings(self):
        self.settings.tts_provider = "system"
        self.assertIsInstance(self.manager.tts, SystemTextToSpeech)
        self.settings.tts_provider = "openai"
        self.assertIsInstance(self.manager.tts, OpenAITextToSpeech)
        self.settings.stt_provider = "google"
        self.assertIsInstance(self.manager.stt, GoogleSpeechToText)

    def test_an_unknown_provider_falls_back_rather_than_crashing(self):
        self.settings.tts_provider = "nonsense"
        self.assertIsInstance(self.manager.tts, SystemTextToSpeech)
        self.settings.stt_provider = "nonsense"
        self.assertIsInstance(self.manager.stt, OpenAISpeechToText)

    def test_a_provider_is_reused_until_the_setting_changes(self):
        self.settings.tts_provider = "system"
        first = self.manager.tts
        self.assertIs(self.manager.tts, first)
        self.manager.refresh_providers()
        self.assertIsNot(self.manager.tts, first)

    def test_silent_mode_speaks_nothing(self):
        spoken: list[str] = []
        self.settings.voice_output_enabled = False
        self.manager._tts = types.SimpleNamespace(speak=spoken.append, stop=lambda: None)
        self.manager._tts_key = self.settings.tts_provider
        self.manager.speak("Hello.")
        self.assertEqual(spoken, [])
        self.assertFalse(self.manager.speaks_aloud)

    def test_speaking_reaches_the_provider(self):
        spoken: list[str] = []
        self.settings.voice_output_enabled = True
        self.manager._tts = types.SimpleNamespace(speak=spoken.append, stop=lambda: None)
        self.manager._tts_key = self.settings.tts_provider
        self.manager.speak("Hello.")
        self.assertEqual(spoken, ["Hello."])

    def test_an_empty_transcript_is_reported_not_passed_on(self):
        self.manager._stt = types.SimpleNamespace(transcribe=lambda path: "   ")
        self.manager._stt_key = self.settings.stt_provider
        with self.assertRaises(VoiceError) as caught:
            self.manager.transcribe(Path("clip.wav"))
        self.assertIn("could be made out", caught.exception.message)

    def test_stopping_speech_never_raises(self):
        self.manager._tts = types.SimpleNamespace(
            speak=lambda text: None, stop=lambda: (_ for _ in ()).throw(RuntimeError("boom"))
        )
        self.manager._tts_key = self.settings.tts_provider
        self.manager.stop_speaking()  # must swallow the failure

    def test_it_carries_a_wake_detector(self):
        self.assertIsNotNone(self.manager.wake_detector)
        self.assertFalse(self.manager.wake_detector.is_running)


if __name__ == "__main__":
    unittest.main(verbosity=2)
