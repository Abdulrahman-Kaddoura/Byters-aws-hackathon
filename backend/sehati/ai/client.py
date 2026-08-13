"""Shared AI-invocation error type, plus a legacy, unimplemented invocation seam.

`AgentInvokeError` is load-bearing — `ai/healthscribe.py` (wired in, see its
own docstring) raises it on every HealthScribe/Transcribe failure. `invoke_agent`
itself is not: it originally backed `ai/service.py`'s `AIService` implementation,
but that path was never wired in — `ai/bedrock.py` (`BedrockAIService`) is the
one implementation `ai/factory.py` actually selects. `invoke_agent` and
`ai/service.py` are kept in the repo as real, unfinished work, not deleted.
"""

from __future__ import annotations

from typing import Any


class AgentInvokeError(Exception):
    """Raised when an AI agent invocation (Bedrock/AgentCore/HealthScribe) fails."""


def invoke_agent(*args: Any, **kwargs: Any) -> Any:
    """Not implemented — AgentCore invocation now lives in BedrockAIService._invoke_agent."""
    raise NotImplementedError(
        "ai.client.invoke_agent is legacy/unwired; use BedrockAIService instead."
    )
