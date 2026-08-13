"""Legacy AgentCore invocation seam — superseded by BedrockAIService.

Originally the low-level `invoke_agent` call lived here, with
`ai/service.py` as the AIService implementation on top of it. That path was
never wired in (see docs/PROJECT_STATUS.md); `ai/bedrock.py` now owns the
AgentCore invocation directly. This file is kept only so `ai/service.py` and
`ai/healthscribe.py` (also unwired) still import cleanly.
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
