"""Seed the 4 system permission groups and provision the initial hospital
admin account. Run once after ``cdk deploy`` (safe to re-run — every step is
idempotent) so there's an account that can sign in to ``/admin`` and start
creating real users.

Usage:
    USER_POOL_ID=<from CDK output> AWS_REGION=us-east-1 \
        python -m scripts.bootstrap_admin [--username admin] [--email admin@sehati.local] [--password 'Admin@123456']

The default password ("admin123" was requested but rejected by the pool's
password policy — 12+ chars, upper/lower/digit/symbol are required, and that
policy protects every account in a system holding patient data, so it isn't
being weakened) is set as PERMANENT: this bootstrap account is usable
immediately, with no forced first-login password change. Change it afterward
from Settings if you'd like a different one.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as a script (python scripts/bootstrap_admin.py) or module.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sehati import cognito_admin  # noqa: E402
from sehati.db import groups_repo, users_repo  # noqa: E402
from sehati.errors import NotFoundError  # noqa: E402
from sehati.models import GROUP_ADMIN  # noqa: E402
from sehati.permissions import SYSTEM_GROUPS  # noqa: E402

DEFAULT_USERNAME = "admin"
DEFAULT_EMAIL = "admin@sehati.local"
DEFAULT_PASSWORD = "Admin@123456"


def _seed_system_groups() -> None:
    for role, spec in SYSTEM_GROUPS.items():
        group_id = spec["id"]
        try:
            groups_repo.get_group(group_id)
            groups_repo.update_group(
                group_id, name=spec["name"], description=spec["description"], permissions=list(spec["permissions"])
            )
            print(f"  synced group  {group_id:<20} ({role})")
        except NotFoundError:
            groups_repo.create_group(
                name=spec["name"],
                description=spec["description"],
                permissions=list(spec["permissions"]),
                group_id=group_id,
                is_system=True,
            )
            print(f"  created group {group_id:<20} ({role})")


def _ensure_admin_user(username: str, email: str, password: str) -> str:
    sub = cognito_admin.find_sub(username)
    if sub is None:
        sub, _temp_password = cognito_admin.create_user(username=username, email=email, name="Administrator")
        print(f"  created Cognito user '{username}' (sub={sub})")
    else:
        print(f"  Cognito user '{username}' already exists (sub={sub})")

    cognito_admin.set_permanent_password(username, password)
    cognito_admin.add_to_group(username, GROUP_ADMIN)

    try:
        users_repo.get_user(sub)
        users_repo.update_user(sub, cognito_group=GROUP_ADMIN, custom_groups=[SYSTEM_GROUPS[GROUP_ADMIN]["id"]])
        print(f"  synced sehati-users record for '{username}'")
    except NotFoundError:
        users_repo.create_user(
            sub=sub,
            username=username,
            email=email,
            name="Administrator",
            cognito_group=GROUP_ADMIN,
            custom_groups=[SYSTEM_GROUPS[GROUP_ADMIN]["id"]],
        )
        print(f"  created sehati-users record for '{username}'")
    return sub


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed permission groups + the initial SEHATI admin account.")
    parser.add_argument("--username", default=DEFAULT_USERNAME)
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    args = parser.parse_args()

    print("==> Seeding system permission groups")
    _seed_system_groups()

    print(f"\n==> Provisioning admin account '{args.username}'")
    _ensure_admin_user(args.username, args.email, args.password)

    print(
        f"\nDone. Sign in with:\n"
        f"  username: {args.username}\n"
        f"  password: {args.password}\n"
    )


if __name__ == "__main__":
    main()
