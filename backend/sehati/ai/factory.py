"""Construct the AI implementation.

There is exactly one: Amazon Bedrock (Claude). No fake/offline mode exists in
production — tests substitute a double via dependency injection at this seam
(see ``backend/tests/conftest.py``'s ``_fake_ai`` fixture), never a
production-selectable provider.
"""

from __future__ import annotations

from functools import lru_cache

from .base import AIService


@lru_cache(maxsize=1)
def get_ai_service() -> AIService:
    from .bedrock import BedrockAIService

    return BedrockAIService()
