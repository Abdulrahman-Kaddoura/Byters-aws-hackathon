"""The Lambda handler: API Gateway proxy event parsing + error shaping."""

import json

import pytest

from sehati.handler import handler


def _event(method, resource, *, path_params=None, body=None, query=None,
           groups=("nurse",), sub="nurse-rima"):
    return {
        "httpMethod": method,
        "resource": resource,
        "pathParameters": path_params,
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {
            "authorizer": {
                "claims": {
                    "sub": sub,
                    "cognito:username": sub,
                    "cognito:groups": ",".join(groups),
                }
            }
        },
    }


@pytest.fixture()
def _nurse_record(aws, seeded_users):
    """The handler looks permissions up in DynamoDB rather than trusting the
    token, so a route test needs a real user record behind the claims."""
    return seeded_users


def test_handler_submit_intake_roundtrip(_nurse_record):
    event = _event(
        "POST", "/cases",
        body={"patient": {"name": "Test"}, "chiefComplaint": "Chest pain"},
    )
    resp = handler(event)
    assert resp["statusCode"] == 200
    result = json.loads(resp["body"])
    assert result["chiefComplaint"] == "Chest pain"
    assert result["lifecycleState"] == "AIInterview"


def test_handler_redacts_clinical_fields_for_a_nurse(_nurse_record):
    """The projection runs in the handler, so this is the assertion that
    matters: what actually goes over the wire has no clinical content."""
    created = json.loads(handler(_event(
        "POST", "/cases", body={"patient": {"name": "Test"}, "chiefComplaint": "Chest pain"},
    ))["body"])

    fetched = json.loads(handler(_event(
        "GET", "/cases/{caseId}", path_params={"caseId": created["id"]},
    ))["body"])

    assert fetched["patient"]["name"] == "Test"
    for field in ("interview", "summary", "diagnoses", "tests", "timeline"):
        assert field not in fetched, f"nurse response leaked '{field}'"
    # ...and the same is true of every row in the list response.
    listed = json.loads(handler(_event("GET", "/cases"))["body"])
    assert listed and all("diagnoses" not in c for c in listed)


def test_handler_unauthenticated_returns_401(aws):
    event = _event("GET", "/cases")
    event["requestContext"] = {"authorizer": {}}
    resp = handler(event)
    assert resp["statusCode"] == 401
    assert json.loads(resp["body"])["errorType"] == "Unauthorized"


def test_handler_unknown_route_returns_404(aws):
    resp = handler(_event("GET", "/no-such-route"))
    assert resp["statusCode"] == 404
    assert json.loads(resp["body"])["errorType"] == "NotFound"


def test_handler_groups_from_bracketed_claim(_nurse_record):
    # API Gateway sometimes flattens array claims to "[a b]" instead of "a,b".
    event = _event("GET", "/cases", groups=())
    event["requestContext"]["authorizer"]["claims"]["cognito:groups"] = "[nurse admin]"
    resp = handler(event)
    assert resp["statusCode"] == 200
    assert isinstance(json.loads(resp["body"]), list)


def test_handler_options_preflight(aws):
    resp = handler({"httpMethod": "OPTIONS", "resource": "/cases"})
    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"
