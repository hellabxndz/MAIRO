"""The contract every Mairo action implements.

Adding a capability means writing one `Tool` subclass and registering it. The
schema in `parameters` is handed straight to the model as a function
definition, so the description is the whole of the model's instructions for it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolResult:
    """What the model is told after an action runs."""

    ok: bool
    message: str
    data: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def success(cls, message: str, **data: Any) -> "ToolResult":
        return cls(True, message, data)

    @classmethod
    def failure(cls, message: str, **data: Any) -> "ToolResult":
        return cls(False, message, data)

    def as_text(self) -> str:
        prefix = "" if self.ok else "FAILED: "
        return f"{prefix}{self.message}"


@dataclass
class ToolContext:
    """Shared services handed to every tool at construction time."""

    settings: Any
    memory: Any
    db: Any


class Tool(ABC):
    """One computer action the assistant can take."""

    name: str = ""
    description: str = ""
    parameters: dict[str, Any] = {"type": "object", "properties": {}}

    # Irreversible, disruptive or privacy-sensitive actions must be confirmed
    # by the user in the interface before `run` is called.
    requires_confirmation: bool = False

    def __init__(self, context: ToolContext) -> None:
        self.context = context

    @property
    def settings(self) -> Any:
        return self.context.settings

    @property
    def memory(self) -> Any:
        return self.context.memory

    def confirmation_text(self, args: dict[str, Any]) -> str:
        """The question shown to the user before a confirmed action runs."""
        return f"Allow Mairo to run “{self.name}”?"

    @abstractmethod
    def run(self, args: dict[str, Any]) -> ToolResult:
        """Perform the action. Raise nothing: return a failed ToolResult instead."""

    def schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
