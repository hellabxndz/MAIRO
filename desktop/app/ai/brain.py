"""The reasoning loop: prompt, tool calls, confirmations, final answer.

`Brain.respond` is deliberately synchronous — the UI runs it on a worker
thread and receives progress through the callbacks it passes in.
"""

from __future__ import annotations

from typing import Any, Callable

from app.ai.base import LLMProvider, LLMResponse
from app.ai.conversation import ConversationStore
from app.config.personality import build_system_prompt
from app.tools.registry import ToolRegistry
from app.utils.errors import AIError, MairoError
from app.utils.logging_setup import get_logger

log = get_logger("ai.brain")

MAX_TOOL_ROUNDS = 5

# Callback signatures the UI provides.
StatusCallback = Callable[[str], None]
ConfirmCallback = Callable[[str, str], bool]  # (tool name, question) -> allowed
ToolEventCallback = Callable[[str, str], None]  # (tool name, outcome text)


class Brain:
    """Turns what the user said into an answer, running tools along the way."""

    def __init__(
        self,
        provider: LLMProvider,
        tools: ToolRegistry,
        memory: Any,
        conversations: ConversationStore,
        settings: Any,
    ) -> None:
        self.provider = provider
        self.tools = tools
        self.memory = memory
        self.conversations = conversations
        self.settings = settings

    # ------------------------------------------------------------- prompt

    def _system_prompt(self) -> str:
        name = self.memory.preferred_name() or self.settings.user_name
        return build_system_prompt(memory_summary=self.memory.summary(), user_name=name)

    def _build_messages(self, user_text: str) -> list[dict[str, Any]]:
        """System prompt plus only the recent tail of this conversation."""
        messages: list[dict[str, Any]] = [{"role": "system", "content": self._system_prompt()}]
        for message in self.conversations.recent_context(self.settings.context_messages):
            messages.append({"role": message.role, "content": message.content})
        messages.append({"role": "user", "content": user_text})
        return messages

    # -------------------------------------------------------------- turn

    def respond(
        self,
        user_text: str,
        on_status: StatusCallback | None = None,
        on_confirm: ConfirmCallback | None = None,
        on_tool_event: ToolEventCallback | None = None,
    ) -> str:
        """Run one full turn and return Mairo's reply text."""
        user_text = (user_text or "").strip()
        if not user_text:
            return ""

        status = on_status or (lambda _: None)
        tool_event = on_tool_event or (lambda _n, _o: None)

        # Build the prompt first, then record the turn: recording it earlier
        # would put the same message into the request twice.
        messages = self._build_messages(user_text)
        self.conversations.add("user", user_text)
        tool_schemas = self.tools.schemas()

        reply = ""
        for round_number in range(MAX_TOOL_ROUNDS):
            status("thinking")
            response: LLMResponse = self.provider.complete(messages, tool_schemas)

            if not response.wants_tools:
                reply = response.text
                break

            messages.append(self._assistant_turn(response))
            for call in response.tool_calls:
                outcome = self._run_call(call, on_confirm, tool_event, status)
                messages.append(
                    {"role": "tool", "tool_call_id": call.id, "content": outcome}
                )
            if response.text:
                # The model said something before calling a tool; keep it if it
                # turns out to be the only text of the turn.
                reply = reply or response.text
        else:
            log.warning("Tool loop hit its limit of %d rounds", MAX_TOOL_ROUNDS)
            reply = reply or (
                "That needed more steps than Mairo allows in one turn. Ask again more specifically."
            )

        if not reply:
            reply = "Done."
        self.conversations.add("assistant", reply)
        return reply

    # -------------------------------------------------------------- tools

    def _run_call(
        self,
        call: Any,
        on_confirm: ConfirmCallback | None,
        tool_event: ToolEventCallback,
        status: StatusCallback,
    ) -> str:
        tool = self.tools.get(call.name)
        if tool is None:
            return f"FAILED: there is no tool called {call.name}."

        if tool.requires_confirmation:
            status("waiting")
            question = tool.confirmation_text(call.arguments)
            allowed = on_confirm(call.name, question) if on_confirm else False
            if not allowed:
                tool_event(call.name, "declined by the user")
                return (
                    "FAILED: the user declined this action. Do not try it again or work around "
                    "it; acknowledge briefly and move on."
                )

        status("acting")
        result = self.tools.run(call.name, call.arguments)
        tool_event(call.name, result.message)
        return result.as_text()

    @staticmethod
    def _assistant_turn(response: LLMResponse) -> dict[str, Any]:
        """Re-encode the model's tool-calling turn for the next request."""
        return {
            "role": "assistant",
            "content": response.text or None,
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": _dump_args(call.arguments),
                    },
                }
                for call in response.tool_calls
            ],
        }

    # ------------------------------------------------------------- health

    def check_ready(self) -> None:
        """Raise a MairoError if the assistant cannot answer yet."""
        if not self.provider.is_configured():
            raise AIError(
                "Mairo has no OpenAI API key.",
                hint="Add OPENAI_API_KEY to desktop/.env and restart.",
            )


def _dump_args(arguments: dict[str, Any]) -> str:
    import json

    try:
        return json.dumps(arguments)
    except (TypeError, ValueError):
        return "{}"


__all__ = ["Brain", "MairoError", "MAX_TOOL_ROUNDS"]
