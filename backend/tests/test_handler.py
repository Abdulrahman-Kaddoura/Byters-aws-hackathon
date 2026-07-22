"""The Lambda handler: AppSync event parsing + error shaping."""

import json

import pytest

from sehati.handler import _AppSyncError, handler


def _event(field, args=None, groups=("physician",), sub="dr-karim"):
    return {
        "info": {"fieldName": field},
        "arguments": args or {},
        "identity": {
            "sub": sub,
            "username": sub,
            "claims": {"cognito:groups": list(groups)},
        },
    }


def test_handler_submit_intake_roundtrip(aws):
    event = _event(
        "submitIntake",
        {"input": {"patient": {"name": "Test"}, "chiefComplaint": "Chest pain"}},
        groups=("physician",),
    )
    result = handler(event)
    assert result["chiefComplaint"] == "Chest pain"
    assert result["lifecycleState"] == "AIInterview"
    # Result must be plain JSON-serializable.
    json.dumps(result)


def test_handler_unauthenticated_raises_appsync_error(aws):
    event = _event("listCases")
    event["identity"] = None
    with pytest.raises(_AppSyncError) as exc:
        handler(event)
    payload = json.loads(str(exc.value))
    assert payload["errorType"] == "Unauthorized"


def test_handler_unknown_field(aws):
    with pytest.raises(_AppSyncError) as exc:
        handler(_event("noSuchField"))
    payload = json.loads(str(exc.value))
    assert payload["errorType"] == "ValidationError"


def test_handler_groups_from_claims_string(aws):
    # Cognito sometimes delivers groups as a comma-joined string.
    event = _event("listCases", groups=())
    event["identity"]["claims"]["cognito:groups"] = "physician,admin"
    result = handler(event)
    assert isinstance(result, list)
