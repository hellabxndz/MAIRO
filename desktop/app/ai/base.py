"""Provider-agnostic types for the language model layer.

Swapping OpenAI for another backend means writing one more `LLMProvider`
subclass; nothing above this line knows which service answered.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    """One turn from the model: text, tool calls, or both."""

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw_message: Any = None

    @property
    def wants_tools(self) -> bool:
        return bool(self.tool_calls)


class LLMProvider(ABC):
    """Anything that can continue a conversation and request tool calls."""

    name = "provider"

    @abstractmethod
    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        """Send the conversation and return the model's next turn."""

    @abstractmethod
    def is_configured(self) -> bool:
        """True when the provider has everything it needs to make a call."""
