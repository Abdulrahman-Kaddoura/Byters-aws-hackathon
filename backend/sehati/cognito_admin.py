"""Thin wrapper around the Cognito ``Admin*`` API used by the admin panel.

Only the Lambda ever calls these — self-signup is disabled
(``self_sign_up_enabled=False`` in the CDK stack) and every route here is
gated by ``users.manage`` in ``resolvers/admin.py``. The Lambda's IAM role is
scoped to exactly these actions on this one user pool (see
``infra/stacks/sehati_stack.py``).
"""

from __future__ import annotations

import os
import secrets
import string
from functools import lru_cache

import boto3

from .errors import ConflictError, NotFoundError, ValidationError

_SYMBOLS = "!@#$%^&*"


@lru_cache(maxsize=1)
def _client():
    # Lazily constructed (like db/tables.py's _resource()) so tests can bind
    # this to a moto mock: a client built before the mock context is entered
    # would otherwise hit real AWS. Tests clear this cache alongside the
    # DynamoDB resource cache — see tests/conftest.py's ``aws`` fixture.
    return boto3.client("cognito-idp", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def _user_pool_id() -> str:
    pool_id = os.environ.get("USER_POOL_ID")
    if not pool_id:
        raise ValidationError("USER_POOL_ID is not configured.")
    return pool_id


def generate_temp_password() -> str:
    """A random password guaranteed to satisfy the pool's policy (12+ chars,
    upper/lower/digit/symbol) — Cognito never hands back a temp password it
    generates itself, so we generate one to be able to show it to the admin."""
    while True:
        pw = "".join(
            secrets.choice(string.ascii_letters + string.digits + _SYMBOLS) for _ in range(16)
        )
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
            and any(c in _SYMBOLS for c in pw)
        ):
            return pw


def find_sub(username: str) -> str | None:
    """The Cognito ``sub`` for an existing username, or ``None`` if there is
    no such user yet. Used by the bootstrap script to make admin-user
    provisioning idempotent."""
    try:
        resp = _client().admin_get_user(UserPoolId=_user_pool_id(), Username=username)
    except _client().exceptions.UserNotFoundException:
        return None
    return next((a["Value"] for a in resp["UserAttributes"] if a["Name"] == "sub"), None)


def create_user(*, username: str, email: str, name: str | None = None) -> tuple[str, str]:
    """Create a Cognito user with a generated temp password, no email sent.

    Returns ``(sub, temporary_password)``. The account is left in
    ``FORCE_CHANGE_PASSWORD`` state — first sign-in triggers the existing
    ``NEW_PASSWORD_REQUIRED`` challenge the frontend already handles.
    """
    temp_password = generate_temp_password()
    attributes = [{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"}]
    if name:
        attributes.append({"Name": "name", "Value": name})

    try:
        resp = _client().admin_create_user(
            UserPoolId=_user_pool_id(),
            Username=username,
            UserAttributes=attributes,
            TemporaryPassword=temp_password,
            MessageAction="SUPPRESS",
        )
    except _client().exceptions.UsernameExistsException as exc:
        raise ConflictError(f"A user named '{username}' already exists.") from exc

    sub = next(
        (a["Value"] for a in resp["User"]["Attributes"] if a["Name"] == "sub"), None
    )
    if not sub:
        raise ValidationError("Cognito did not return a subject for the new user.")
    return sub, temp_password


def set_permanent_password(username: str, password: str) -> None:
    _client().admin_set_user_password(
        UserPoolId=_user_pool_id(), Username=username, Password=password, Permanent=True
    )


def add_to_group(username: str, group_name: str) -> None:
    _client().admin_add_user_to_group(
        UserPoolId=_user_pool_id(), Username=username, GroupName=group_name
    )


def remove_from_group(username: str, group_name: str) -> None:
    try:
        _client().admin_remove_user_from_group(
            UserPoolId=_user_pool_id(), Username=username, GroupName=group_name
        )
    except _client().exceptions.UserNotFoundException as exc:
        raise NotFoundError(f"User '{username}' not found.") from exc


def disable_user(username: str) -> None:
    _client().admin_disable_user(UserPoolId=_user_pool_id(), Username=username)


def enable_user(username: str) -> None:
    _client().admin_enable_user(UserPoolId=_user_pool_id(), Username=username)
