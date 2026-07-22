"""Pluggable AI seam.

The backend owns the workflow, data and API; the AI team owns the model,
prompts and RAG. They meet at :class:`~sehati.ai.base.AIService`. Import the
active implementation via :func:`~sehati.ai.factory.get_ai_service`.
"""

from .base import AIResult, AIService  # noqa: F401
from .factory import get_ai_service  # noqa: F401
