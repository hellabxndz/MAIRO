"""Basic tests for the parts of Mairo that do not need a screen or a network.

Run them with:   python -m pytest tests    (or: python -m unittest discover tests)
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Keep every test's data in a throwaway directory.
_TEMP = tempfile.mkdtemp(prefix="mairo-tests-")
os.environ["MAIRO_HOME"] = _TEMP

from app.ai.base import LLMResponse, ToolCall  # noqa: E402
from app.ai.brain import Brain  # noqa: E402
from app.ai.conversation import ConversationStore  # noqa: E402
from app.config.personality import build_system_prompt  # noqa: E402
from app.config.settings import Settings  # noqa: E402
from app.database.db import Database  # noqa: E402
from app.memory.memory_store import MemoryStore, normalise_key  # noqa: E402
from app.tools.base import ToolContext, ToolResult  # noqa: E402
from app.tools.registry import build_default_registry  # noqa: E402
from app.tools.web import normalise_url  # noqa: E402
from app.utils.logging_setup import RedactingFilter  # noqa: E402


def make_stack():
    """A fresh in-memory-ish stack: database, memory, conversations, tools."""
    database = Database(Path(_TEMP) / f"test-{os.urandom(4).hex()}.db")
    settings = Settings()
    memory = MemoryStore(database)
    conversations = ConversationStore(database, enabled=True)
    conversations.start_new()
    tools = build_default_registry(ToolContext(settings=settings, memory=memory, db=database))
    return settings, database, memory, conversations, tools


class FakeProvider:
    """Replays a scripted sequence of model turns."""

    def __init__(self, turns):
        self.turns = list(turns)
        self.requests = []

    def is_configured(self):
        return True

    def complete(self, messages, tools=None):
        self.requests.append(messages)
        return self.turns.pop(0)


class MemoryTests(unittest.TestCase):
    def setUp(self):
        _, _, self.memory, _, _ = make_stack()

    def test_remember_and_recall(self):
        self.memory.remember("Preferred Browser", "Chrome")
        self.assertEqual(self.memory.get("preferred_browser"), "Chrome")

    def test_remember_overwrites(self):
        self.memory.remember("preferred_browser", "Chrome")
        self.memory.remember("preferred_browser", "Firefox")
        self.assertEqual(self.memory.get("preferred_browser"), "Firefox")
        self.assertEqual(len(self.memory.all()), 1)

    def test_forget_by_loose_phrase(self):
        self.memory.remember("favourite_music_app", "Spotify")
        self.assertTrue(self.memory.forget("favourite music app"))
        self.assertIsNone(self.memory.get("favourite_music_app"))

    def test_forget_missing_returns_false(self):
        self.assertFalse(self.memory.forget("nothing_here"))

    def test_summary_lists_entries(self):
        self.memory.remember("preferred_name", "Sam", "person")
        self.assertIn("Sam", self.memory.summary())

    def test_key_normalisation(self):
        self.assertEqual(normalise_key("  My Favourite App! "), "my_favourite_app")


class ConversationTests(unittest.TestCase):
    def setUp(self):
        _, self.db, _, self.conversations, _ = make_stack()

    def test_messages_are_saved_and_listed(self):
        self.conversations.add("user", "hello")
        self.conversations.add("assistant", "Ready.")
        listed = self.conversations.list_conversations()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["message_count"], 2)

    def test_recent_context_is_capped(self):
        for index in range(30):
            self.conversations.add("user", f"message {index}")
        self.assertEqual(len(self.conversations.recent_context(limit=6)), 6)

    def test_history_disabled_keeps_nothing_on_disk(self):
        self.conversations.set_enabled(False)
        self.conversations.start_new()
        self.conversations.add("user", "private")
        self.assertEqual(self.conversations.list_conversations(), [])
        self.assertEqual(len(self.conversations.recent_context()), 1)

    def test_delete_all(self):
        self.conversations.add("user", "hello")
        self.conversations.delete_all()
        self.assertEqual(self.conversations.list_conversations(), [])


class ToolTests(unittest.TestCase):
    def setUp(self):
        self.settings, self.db, self.memory, _, self.tools = make_stack()

    def test_every_tool_has_a_valid_schema(self):
        for schema in self.tools.schemas():
            function = schema["function"]
            self.assertTrue(function["name"])
            self.assertTrue(function["description"])
            self.assertEqual(function["parameters"]["type"], "object")

    def test_expected_tools_are_registered(self):
        for name in [
            "open_application", "launch_spotify", "launch_discord", "launch_chrome",
            "launch_vscode", "open_website", "search_google", "search_youtube",
            "open_path", "get_datetime", "create_note", "read_notes", "set_volume",
            "adjust_volume", "set_mute", "take_screenshot", "read_clipboard",
            "lock_computer", "remember", "recall_memory", "forget_memory",
        ]:
            self.assertIsNotNone(self.tools.get(name), f"{name} is not registered")

    def test_risky_tools_require_confirmation(self):
        for name in ["take_screenshot", "read_clipboard", "lock_computer", "forget_memory"]:
            self.assertTrue(self.tools.get(name).requires_confirmation, name)

    def test_everyday_tools_do_not_require_confirmation(self):
        for name in ["open_website", "search_google", "get_datetime", "create_note"]:
            self.assertFalse(self.tools.get(name).requires_confirmation, name)

    def test_datetime_tool(self):
        result = self.tools.run("get_datetime", {"format": "time"})
        self.assertTrue(result.ok)
        self.assertIn("The time is", result.message)

    def test_notes_round_trip(self):
        self.tools.run("create_note", {"text": "call Ivan tomorrow"})
        result = self.tools.run("read_notes", {})
        self.assertIn("call Ivan tomorrow", result.message)

    def test_empty_note_is_rejected(self):
        self.assertFalse(self.tools.run("create_note", {"text": "   "}).ok)

    def test_memory_tools(self):
        self.assertTrue(self.tools.run("remember", {"key": "car", "value": "AMG CLA 45"}).ok)
        self.assertIn("AMG CLA 45", self.tools.run("recall_memory", {}).message)
        self.assertTrue(self.tools.run("forget_memory", {"key": "car"}).ok)

    def test_unknown_tool_fails_cleanly(self):
        result = self.tools.run("no_such_tool", {})
        self.assertFalse(result.ok)
        self.assertIn("no tool called", result.message)

    def test_an_application_name_is_not_a_path(self):
        from app.tools.apps import is_plain_name

        self.assertTrue(is_plain_name("Spotify"))
        self.assertTrue(is_plain_name("vs code"))
        self.assertFalse(is_plain_name("../../evil.exe"))
        self.assertFalse(is_plain_name("C:/Windows/System32/cmd.exe"))
        self.assertFalse(is_plain_name(r"..\payload.bat"))
        self.assertFalse(is_plain_name(""))

    def test_the_launcher_refuses_a_path(self):
        result = self.tools.run("open_application", {"name": "../../thing.exe"})
        self.assertFalse(result.ok)
        self.assertIn("open_path", result.message)

    def test_url_normalisation(self):
        self.assertEqual(normalise_url("youtube"), "https://www.youtube.com")
        self.assertEqual(normalise_url("example.com"), "https://example.com")
        self.assertEqual(normalise_url("https://a.test/x"), "https://a.test/x")
        self.assertEqual(normalise_url("javascript:alert(1)"), "")
        self.assertEqual(normalise_url("file:///etc/passwd"), "")
        self.assertEqual(normalise_url("just some words"), "")

    def test_open_path_rejects_missing_target(self):
        result = self.tools.run("open_path", {"path": "/definitely/not/here/12345"})
        self.assertFalse(result.ok)


class BrainTests(unittest.TestCase):
    def setUp(self):
        self.settings, self.db, self.memory, self.conversations, self.tools = make_stack()

    def _brain(self, provider):
        return Brain(provider, self.tools, self.memory, self.conversations, self.settings)

    def test_plain_reply(self):
        provider = FakeProvider([LLMResponse(text="All set.")])
        reply = self._brain(provider).respond("hello")
        self.assertEqual(reply, "All set.")
        self.assertEqual(self.conversations.recent_context()[-1].content, "All set.")

    def test_system_prompt_carries_memory(self):
        self.memory.remember("preferred_name", "Sam", "person")
        provider = FakeProvider([LLMResponse(text="Hello Sam.")])
        self._brain(provider).respond("who am I?")
        system_message = provider.requests[0][0]["content"]
        self.assertIn("Sam", system_message)

    def test_tool_call_then_answer(self):
        provider = FakeProvider([
            LLMResponse(tool_calls=[ToolCall("1", "get_datetime", {"format": "date"})]),
            LLMResponse(text="It is Tuesday."),
        ])
        events = []
        reply = self._brain(provider).respond(
            "what day is it?", on_tool_event=lambda name, outcome: events.append(name)
        )
        self.assertEqual(reply, "It is Tuesday.")
        self.assertEqual(events, ["get_datetime"])

    def test_declined_confirmation_blocks_the_action(self):
        provider = FakeProvider([
            LLMResponse(tool_calls=[ToolCall("1", "lock_computer", {})]),
            LLMResponse(text="Left it unlocked."),
        ])
        asked = []
        reply = self._brain(provider).respond(
            "lock my computer",
            on_confirm=lambda name, question: asked.append(name) or False,
        )
        self.assertEqual(asked, ["lock_computer"])
        self.assertEqual(reply, "Left it unlocked.")
        tool_message = provider.requests[1][-1]
        self.assertEqual(tool_message["role"], "tool")
        self.assertIn("declined", tool_message["content"])

    def test_confirmation_is_requested_for_risky_tools(self):
        provider = FakeProvider([
            LLMResponse(tool_calls=[ToolCall("1", "read_clipboard", {})]),
            LLMResponse(text="Nothing copied."),
        ])
        questions = []

        def confirm(name, question):
            questions.append(question)
            return False

        self._brain(provider).respond("what is on my clipboard?", on_confirm=confirm)
        self.assertIn("clipboard", questions[0].lower())

    def test_user_message_is_not_duplicated_in_the_request(self):
        provider = FakeProvider([LLMResponse(text="Noted.")])
        self._brain(provider).respond("remember the milk")
        sent = provider.requests[0]
        said = [m for m in sent if m.get("content") == "remember the milk"]
        self.assertEqual(len(said), 1)
        self.assertEqual(sent[-1]["role"], "user")

    def test_no_duplication_when_history_is_disabled(self):
        self.conversations.set_enabled(False)
        self.conversations.start_new()
        provider = FakeProvider([LLMResponse(text="Noted.")])
        self._brain(provider).respond("remember the milk")
        sent = provider.requests[0]
        said = [m for m in sent if m.get("content") == "remember the milk"]
        self.assertEqual(len(said), 1)

    def test_only_recent_context_is_sent(self):
        self.settings.context_messages = 4
        for index in range(20):
            self.conversations.add("user", f"old message {index}")
        provider = FakeProvider([LLMResponse(text="Fine.")])
        self._brain(provider).respond("new question")
        sent = provider.requests[0]
        # system prompt + 4 recent turns + the new question
        self.assertEqual(len(sent), 6)
        self.assertEqual(sent[0]["role"], "system")
        self.assertEqual(sent[-1]["content"], "new question")
        self.assertEqual(sent[1]["content"], "old message 16")

    def test_status_callbacks_fire(self):
        provider = FakeProvider([LLMResponse(text="Done.")])
        states = []
        self._brain(provider).respond("hi", on_status=states.append)
        self.assertIn("thinking", states)

    def test_empty_input_is_ignored(self):
        provider = FakeProvider([])
        self.assertEqual(self._brain(provider).respond("   "), "")


class SettingsTests(unittest.TestCase):
    def test_defaults_and_round_trip(self):
        settings = Settings()
        settings.theme = "aurora"
        settings.speech_rate = 205
        settings.save()
        reloaded = Settings.load()
        self.assertEqual(reloaded.theme, "aurora")
        self.assertEqual(reloaded.speech_rate, 205)

    def test_unknown_keys_are_ignored(self):
        settings = Settings()
        settings.apply({"nonsense": 1, "theme": "ember"})
        self.assertEqual(settings.theme, "ember")

    def test_model_falls_back_to_environment(self):
        settings = Settings()
        os.environ["OPENAI_MODEL"] = "gpt-test"
        self.assertEqual(settings.active_model, "gpt-test")
        settings.model = "explicit-model"
        self.assertEqual(settings.active_model, "explicit-model")
        del os.environ["OPENAI_MODEL"]

    def test_placeholder_key_is_not_accepted(self):
        settings = Settings()
        os.environ["OPENAI_API_KEY"] = "your-key-here"
        self.assertFalse(settings.has_api_key)
        os.environ["OPENAI_API_KEY"] = "sk-realish-value"
        self.assertTrue(settings.has_api_key)
        del os.environ["OPENAI_API_KEY"]


class PackagingTests(unittest.TestCase):
    """Paths have to move when the app is built into a single executable."""

    def test_env_sits_beside_the_executable_when_frozen(self):
        from app.config import paths

        original = getattr(sys, "frozen", None)
        sys.frozen = True
        previous_executable = sys.executable
        sys.executable = str(Path(_TEMP) / "Mairo" / "Mairo.exe")
        try:
            self.assertEqual(paths.project_root(), Path(_TEMP) / "Mairo")
            self.assertEqual(paths.env_file(), Path(_TEMP) / "Mairo" / ".env")
        finally:
            sys.executable = previous_executable
            if original is None:
                del sys.frozen
            else:
                sys.frozen = original

    def test_env_sits_in_the_project_when_running_from_source(self):
        from app.config import paths

        self.assertFalse(getattr(sys, "frozen", False))
        self.assertEqual(paths.env_file().name, ".env")
        self.assertTrue((paths.project_root() / "main.py").exists())


class LoggingTests(unittest.TestCase):
    def test_secrets_are_redacted(self):
        redact = RedactingFilter.redact
        self.assertNotIn("sk-abcd1234efgh", redact("key sk-abcd1234efgh used"))
        self.assertNotIn("abc.def", redact("Authorization: Bearer abc.def"))
        self.assertNotIn("xyz.123", redact("Bearer xyz.123"))
        self.assertNotIn("t0ps3cret", redact("api_key: t0ps3cret"))
        self.assertIn("[redacted]", redact("password=hunter2"))
        self.assertEqual(redact("nothing secret here"), "nothing secret here")


class PersonalityTests(unittest.TestCase):
    def test_prompt_states_identity_and_limits(self):
        prompt = build_system_prompt(memory_summary="- likes Spotify", user_name="Sam")
        self.assertIn("Mairo", prompt)
        self.assertIn("conscious", prompt)
        self.assertIn("likes Spotify", prompt)
        self.assertIn("Sam", prompt)


class ToolResultTests(unittest.TestCase):
    def test_failure_is_marked_for_the_model(self):
        self.assertTrue(ToolResult.failure("nope").as_text().startswith("FAILED:"))
        self.assertEqual(ToolResult.success("fine").as_text(), "fine")


if __name__ == "__main__":
    unittest.main(verbosity=2)
