"""The doctor's own consultation with the patient, as a second source of history.

The AI interview on the nurse's device is one account of the presentation; the
doctor sitting down with the patient is another, and it is usually the better
one. This resolver is what gets that second account into the case: the doctor
is asked once, when they first open a case routed to them, whether a recording
of the consultation exists. If it does, it is uploaded
(``documents.upload_case_audio``), transcribed by HealthScribe
(``resolvers/transcribe.py``) and its clinical summary is stored here, on
``case["consultation"]``, where ``ai/bedrock._case_context`` picks it up
alongside the interview transcript for every downstream step.

The prompt is asked once and only once — ``consultation.prompted`` is the flag
that says the question has been put, whichever way it was answered. A case that
runs on the AI interview alone is a legitimate answer, not an unfinished one.
"""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from ..models import now_iso, recent_update, timeline_event


def set_consultation(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Answer the consultation-recording prompt, with or without a recording.

    ``hasRecording: false`` records that the doctor was asked and said no,
    which is what stops the prompt coming back. ``hasRecording: true`` carries
    the HealthScribe ``summary`` the frontend polled for.
    """
    ctx.require_permission("cases.view_clinical")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    has_recording = bool(args.get("hasRecording"))
    summary = args.get("summary") if has_recording else None
    if has_recording and not summary:
        raise ValidationError(
            "A consultation marked as recorded must carry the transcription summary."
        )

    consultation: dict[str, Any] = {
        "prompted": True,
        "hasRecording": has_recording,
        "answeredAt": now_iso(),
        "answeredBy": ctx.username,
    }
    if has_recording:
        consultation["summary"] = summary
        # Pointers back to the recording, which lives on the case as an audio
        # document (resolvers/documents.py): the transcript itself is there,
        # not here, because that is what makes it AI context.
        for key in ("jobName", "documentId", "s3Key"):
            if args.get(key):
                consultation[key] = args[key]
    case["consultation"] = consultation

    if has_recording:
        case.setdefault("timeline", []).append(
            timeline_event(
                "Consultation recorded",
                "The doctor's consultation with the patient was transcribed and added to the case.",
                "doctor",
                case.get("stage", "interview"),
            )
        )
        case.setdefault("recentUpdates", []).insert(
            0, recent_update("Consultation recording transcribed", "system")
        )
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="setConsultation",
        output={"hasRecording": has_recording},
    )
    return {"case": case, "consultation": consultation}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
