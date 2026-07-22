"""Select the active AI implementation from the ``AI_PROVIDER`` env var.

    AI_PROVIDER=stub     -> StubAIService     (default; offline, no cost)
    AI_PROVIDER=bedrock  -> BedrockAIService  (Amazon Bedrock / Claude)

The instance is cached per Lambda container. The Bedrock adapter is imported
lazily so the stub path never needs botocore's Bedrock clients.
"""

from __future__ import annotations

import os
from functools import lru_cache

from .base import AIService


@lru_cache(maxsize=1)
def get_ai_service() -> AIService:
    provider = os.environ.get("AI_PROVIDER", "stub").strip().lower()
    if provider == "bedrock":
        from .bedrock import BedrockAIService

        return BedrockAIService()
    from .stub import StubAIService

    return StubAIService()
