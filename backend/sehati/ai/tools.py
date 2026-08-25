"""Tools the agent can call during a Converse turn.

There is one so far: **document retrieval**. The agent (``ai/bedrock.py``)
hands Bedrock a tool spec, the model decides it needs the patient's paperwork
and emits a ``toolUse`` block, we run the retrieval here, and the passages go
back into the same conversation as a ``toolResult``. The model then answers
with the documents in front of it.

Why a tool rather than stuffing every document into every prompt: the case's
folder is up to 40k characters of referral letters and lab reports
(``resolvers/documents.py``), most of it irrelevant to any one question. The
model asks for what it needs, gets the passages that match, and what it
actually retrieved is recorded on the ``AIResult`` for the audit trail — which
a pre-stuffed blob could never tell us.

The retrieval itself lives in ``resolvers/documents.py``; this module is the
wiring between it and the Converse API, plus the scoping rule that matters:
**a tool call only ever reads the case it was invoked for.** The model supplies
a query, never a case id — the case is bound by the caller.
"""

from __future__ import annotations

from typing import Any

from ..models import PatientCase
from . import prompts

#: The tool name the model sees. Referred to as "TTEV2" in the original
#: hand-off note; renaming it is this constant plus a redeploy, since nothing
#: else hard-codes the string.
DOCUMENT_TOOL_NAME = "retrieve_case_documents"

#: A runaway tool loop is a runaway Bedrock bill and a Lambda timeout. Three
#: rounds is enough for "retrieve, refine the query, retrieve again".
MAX_TOOL_ROUNDS = 3

#: Passages returned per call. Each is at most ~1.2k characters, so a full
#: round trip adds roughly 6k characters to the conversation.
DEFAULT_PASSAGE_LIMIT = 5


def document_tool_spec() -> dict[str, Any]:
    """The Bedrock Converse ``toolSpec`` for the document retrieval tool."""
    return {
        "toolSpec": {
            "name": DOCUMENT_TOOL_NAME,
            "description": prompts.DOCUMENT_TOOL_DESCRIPTION,
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "What to look for, in clinical terms — a "
                                "symptom, finding, test name, medication or "
                                "condition. Omit to see the most recently "
                                "uploaded documents."
                            ),
                        },
                    },
                    "required": [],
                }
            },
        }
    }


def tool_config() -> dict[str, Any]:
    """The ``toolConfig`` block passed to ``converse``."""
    return {"tools": [document_tool_spec()]}


def run_tool(
    name: str, tool_input: dict[str, Any], case: PatientCase
) -> tuple[str, list[dict[str, Any]]]:
    """Execute a tool call the model asked for, against ``case``.

    Returns ``(text_for_the_model, passages)``. The passages are also merged
    into the ``AIResult``'s ``retrieved_context`` so the physician can review
    exactly which documents the recommendation rested on.

    A tool failure is answered, not raised: the model gets a note saying the
    retrieval failed and can still reason from the case context. Losing an
    uploaded lab report should degrade the answer, not 500 the request.
    """
    if name != DOCUMENT_TOOL_NAME:
        return f"Unknown tool '{name}'. No such tool is available.", []

    from ..resolvers import documents

    query = (tool_input or {}).get("query") or None
    try:
        passages = documents.retrieve_document_passages(
            case, query, limit=DEFAULT_PASSAGE_LIMIT
        )
    except Exception as exc:  # noqa: BLE001 - see docstring
        return (
            f"Document retrieval failed ({type(exc).__name__}). Reason from the "
            "case context alone and say that the uploaded documents could not "
            "be read.",
            [],
        )
    return prompts.document_evidence_block(passages), passages
