"""The Lambda handler: API Gateway proxy event parsing + error shaping."""

import json

from sehati.handler import handler


def _event(method, resource, *, path_params=None, body=None, query=None,
           groups=("physician",), sub="dr-karim"):
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


def test_handler_submit_intake_roundtrip(aws):
    event = _event(
        "POST", "/cases",
        body={"patient": {"name": "Test"}, "chiefComplaint": "Chest pain"},
        groups=("physician",),
    )
    resp = handler(event)
    assert resp["statusCode"] == 200
    result = json.loads(resp["body"])
    assert result["chiefComplaint"] == "Chest pain"
    assert result["lifecycleState"] == "AIInterview"


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


def test_handler_groups_from_bracketed_claim(aws):
    # API Gateway sometimes flattens array claims to "[a b]" instead of "a,b".
    event = _event("GET", "/cases", groups=())
    event["requestContext"]["authorizer"]["claims"]["cognito:groups"] = "[physician admin]"
    resp = handler(event)
    assert resp["statusCode"] == 200
    assert isinstance(json.loads(resp["body"]), list)


def test_handler_options_preflight_allowed_origin(aws, monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")
    resp = handler({
        "httpMethod": "OPTIONS", "resource": "/cases",
        "headers": {"Origin": "http://localhost:5173"},
    })
    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "http://localhost:5173"


def test_handler_options_preflight_unknown_origin_omits_header(aws, monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")
    resp = handler({
        "httpMethod": "OPTIONS", "resource": "/cases",
        "headers": {"Origin": "https://evil.example"},
    })
    assert resp["statusCode"] == 200
    assert "Access-Control-Allow-Origin" not in resp["headers"]
