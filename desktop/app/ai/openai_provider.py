"""OpenAI chat completions with function calling."""

from __future__ import annotations

import json
from typing import Any

from app.ai.base import LLMProvider, LLMResponse, ToolCall
from app.utils.errors import AIError, ConfigurationError
from app.utils.logging_setup import get_logger

log = get_logger("ai.openai")


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, settings: Any) -> None:
        self.settings = settings
        self._client = None
        self._client_key = ""

    # ------------------------------------------------------------- client

    def is_configured(self) -> bool:
        return self.settings.has_api_key

    def _get_client(self):
        if not self.settings.has_api_key:
            raise ConfigurationError(
                "No OpenAI API key found.",
                hint="Add OPENAI_API_KEY to the .env file next to main.py, then restart Mairo.",
            )
        key = self.settings.api_key
        if self._client is None or key != self._client_key:
            try:
                from openai import OpenAI
            except ImportError as exc:  # pragma: no cover - dependency missing
                raise ConfigurationError(
                    "The openai package is not installed.",
                    hint="Run: pip install -r requirements.txt",
                ) from exc
            kwargs: dict[str, Any] = {"api_key": key, "timeout": self.settings.request_timeout}
            if self.settings.base_url:
                kwargs["base_url"] = self.settings.base_url
            self._client = OpenAI(**kwargs)
            self._client_key = key
        return self._client

    # ---------------------------------------------------------- completion

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        client = self._get_client()
        model = self.settings.active_model
        request: dict[str, Any] = {"model": model, "messages": messages}
        if tools:
            request["tools"] = tools
            request["tool_choice"] = "auto"

        try:
            completion = client.chat.completions.create(**request)
        except Exception as exc:
            raise self._translate(exc, model) from exc

        choice = completion.choices[0].message
        calls: list[ToolCall] = []
        for call in getattr(choice, "tool_calls", None) or []:
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                log.warning("Model sent malformed arguments for %s", call.function.name)
                arguments = {}
            if not isinstance(arguments, dict):
                arguments = {}
            calls.append(ToolCall(id=call.id, name=call.function.name, arguments=arguments))

        return LLMResponse(text=(choice.content or "").strip(), tool_calls=calls, raw_message=choice)

    # ------------------------------------------------------------- errors

    @staticmethod
    def _translate(exc: Exception, model: str) -> AIError:
        """Turn an SDK exception into something worth showing the user."""
        name = type(exc).__name__
        text = str(exc)
        log.error("OpenAI request failed (%s)", name)

        if name in ("APIConnectionError", "APITimeoutError") or "timeout" in text.lower():
            return AIError(
                "Mairo could not reach the OpenAI service.",
                hint="Check your internet connection and try again.",
            )
        if name == "AuthenticationError" or "invalid_api_key" in text or "401" in text:
            return AIError(
                "The OpenAI API key was rejected.",
                hint="Check OPENAI_API_KEY in your .env file.",
            )
        if name == "RateLimitError" or "429" in text:
            return AIError(
                "The OpenAI account hit a rate limit or has no remaining quota.",
                hint="Wait a moment, or check your billing at platform.openai.com.",
            )
        if name == "NotFoundError" or "does not exist" in text or "model_not_found" in text:
            return AIError(
                f"The model '{model}' is not available to this account.",
                hint="Change OPENAI_MODEL in .env, or pick another model in Settings.",
            )
        if name == "BadRequestError":
            return AIError("OpenAI rejected the request.", hint=text[:200])
        return AIError("The AI request failed.", hint=text[:200])
