"""Checks the OpenAI provider against a local stand-in server.

This exercises the real openai client, so it catches wire-format mistakes that
a hand-written fake would hide. No network and no API key are involved.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# The stand-in server is local: never send these requests through a proxy.
os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

from app.ai.openai_provider import OpenAIProvider  # noqa: E402
from app.config.settings import Settings  # noqa: E402
from app.utils.errors import AIError, ConfigurationError  # noqa: E402

RECEIVED: list[dict] = []
NEXT_RESPONSE: dict = {}
NEXT_STATUS: list[int] = [200]


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 - http.server naming
        length = int(self.headers.get("Content-Length", 0))
        RECEIVED.append(json.loads(self.rfile.read(length) or "{}"))
        status = NEXT_STATUS[0]
        body = json.dumps(NEXT_RESPONSE).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def chat_response(content=None, tool_calls=None) -> dict:
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 0,
        "model": "test-model",
        "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
    }


class OpenAIProviderTests(unittest.TestCase):
    server = None
    thread = None

    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}/v1"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        RECEIVED.clear()
        NEXT_STATUS[0] = 200
        os.environ["OPENAI_API_KEY"] = "sk-test-not-a-real-key"
        os.environ["OPENAI_BASE_URL"] = self.base_url
        os.environ["OPENAI_MODEL"] = "test-model"
        self.settings = Settings()

    def tearDown(self):
        for key in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"):
            os.environ.pop(key, None)

    def test_plain_text_response(self):
        NEXT_RESPONSE.clear()
        NEXT_RESPONSE.update(chat_response(content="Ready when you are."))
        provider = OpenAIProvider(self.settings)
        result = provider.complete([{"role": "user", "content": "hello"}])
        self.assertEqual(result.text, "Ready when you are.")
        self.assertFalse(result.wants_tools)
        self.assertEqual(RECEIVED[0]["model"], "test-model")

    def test_tool_call_is_parsed(self):
        NEXT_RESPONSE.clear()
        NEXT_RESPONSE.update(
            chat_response(
                tool_calls=[
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "search_youtube",
                            "arguments": '{"query": "Travis Scott"}',
                        },
                    }
                ]
            )
        )
        provider = OpenAIProvider(self.settings)
        result = provider.complete(
            [{"role": "user", "content": "search youtube for travis scott"}],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": "search_youtube",
                        "description": "Search YouTube.",
                        "parameters": {"type": "object", "properties": {}},
                    },
                }
            ],
        )
        self.assertTrue(result.wants_tools)
        call = result.tool_calls[0]
        self.assertEqual(call.name, "search_youtube")
        self.assertEqual(call.arguments, {"query": "Travis Scott"})
        self.assertEqual(RECEIVED[0]["tool_choice"], "auto")

    def test_malformed_arguments_do_not_raise(self):
        NEXT_RESPONSE.clear()
        NEXT_RESPONSE.update(
            chat_response(
                tool_calls=[
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "get_datetime", "arguments": "{not json"},
                    }
                ]
            )
        )
        provider = OpenAIProvider(self.settings)
        result = provider.complete([{"role": "user", "content": "time?"}])
        self.assertEqual(result.tool_calls[0].arguments, {})

    def test_a_rejected_key_becomes_a_readable_error(self):
        NEXT_RESPONSE.clear()
        NEXT_RESPONSE.update({"error": {"message": "Incorrect API key", "code": "invalid_api_key"}})
        NEXT_STATUS[0] = 401
        provider = OpenAIProvider(self.settings)
        with self.assertRaises(AIError) as caught:
            provider.complete([{"role": "user", "content": "hello"}])
        self.assertIn("key was rejected", caught.exception.message)

    def test_an_unknown_model_becomes_a_readable_error(self):
        NEXT_RESPONSE.clear()
        NEXT_RESPONSE.update({"error": {"message": "The model does not exist", "code": "model_not_found"}})
        NEXT_STATUS[0] = 404
        provider = OpenAIProvider(self.settings)
        with self.assertRaises(AIError) as caught:
            provider.complete([{"role": "user", "content": "hello"}])
        self.assertIn("not available", caught.exception.message)

    def test_rate_limit_becomes_a_readable_error(self):
        NEXT_RESPONSE.clear()
        NEXT_RESPONSE.update({"error": {"message": "Rate limit reached"}})
        NEXT_STATUS[0] = 429
        provider = OpenAIProvider(self.settings)
        with self.assertRaises(AIError) as caught:
            provider.complete([{"role": "user", "content": "hello"}])
        self.assertIn("rate limit", caught.exception.message.lower())

    def test_missing_key_is_a_configuration_error(self):
        os.environ.pop("OPENAI_API_KEY")
        provider = OpenAIProvider(Settings())
        self.assertFalse(provider.is_configured())
        with self.assertRaises(ConfigurationError):
            provider.complete([{"role": "user", "content": "hello"}])

    def test_a_full_tool_round_trip_matches_what_the_brain_sends(self):
        """The brain's second request must carry the assistant and tool turns."""
        from app.ai.brain import Brain
        from app.ai.conversation import ConversationStore
        from app.database.db import Database
        from app.memory.memory_store import MemoryStore
        from app.tools.base import ToolContext
        from app.tools.registry import build_default_registry

        import tempfile

        database = Database(Path(tempfile.mkdtemp()) / "roundtrip.db")
        memory = MemoryStore(database)
        conversations = ConversationStore(database, enabled=True)
        conversations.start_new()
        tools = build_default_registry(
            ToolContext(settings=self.settings, memory=memory, db=database)
        )
        provider = OpenAIProvider(self.settings)
        brain = Brain(provider, tools, memory, conversations, self.settings)

        responses = [
            chat_response(
                tool_calls=[
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "get_datetime", "arguments": '{"format": "time"}'},
                    }
                ]
            ),
            chat_response(content="It is just past ten."),
        ]

        original = Handler.do_POST

        def scripted(handler_self):
            NEXT_RESPONSE.clear()
            NEXT_RESPONSE.update(responses[min(len(RECEIVED), len(responses) - 1)])
            original(handler_self)

        Handler.do_POST = scripted
        try:
            reply = brain.respond("what time is it?")
        finally:
            Handler.do_POST = original

        self.assertEqual(reply, "It is just past ten.")
        second = RECEIVED[1]["messages"]
        self.assertEqual(second[-2]["role"], "assistant")
        self.assertEqual(second[-2]["tool_calls"][0]["function"]["name"], "get_datetime")
        self.assertEqual(second[-1]["role"], "tool")
        self.assertEqual(second[-1]["tool_call_id"], "call_1")
        self.assertIn("The time is", second[-1]["content"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
