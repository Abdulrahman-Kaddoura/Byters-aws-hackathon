"""Migrate existing accounts onto the doctor/nurse/admin role model.

Run this **after** ``cdk deploy``. The deploy replaces the old Cognito groups
(``patient``/``physician``/``admin``/``compliance``) with the new three, which
means the old group memberships are gone by the time this runs — so roles are
read from the ``sehati-users`` table, which survives the deploy, rather than
from Cognito.

What it does:

* re-seeds the three system permission groups (``system-doctor``,
  ``system-nurse``, ``system-admin``);
* moves every ``physician`` account to ``doctor`` — in Cognito and in the
  user record — swapping ``system-physician`` for ``system-doctor``;
* reports every ``compliance`` / ``patient`` account. Those roles no longer
  exist, so the accounts can still sign in but reach nothing. An administrator
  should either re-role them from the admin panel or disable them; this script
  deliberately does not guess which.

Idempotent: running it twice is a no-op the second time.

Usage:
    USER_POOL_ID=<from CDK output> AWS_REGION=us-east-1 \
        python -m scripts.migrate_roles [--dry-run]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sehati import cognito_admin  # noqa: E402
from sehati.db import users_repo  # noqa: E402
from sehati.errors import AppError  # noqa: E402
from sehati.models import GROUP_DOCTOR, ROLES  # noqa: E402
from sehati.permissions import SYSTEM_GROUPS  # noqa: E402

from scripts.bootstrap_admin import _seed_system_groups  # noqa: E402

# Old Cognito group -> new role, for accounts that have a clean equivalent.
_ROLE_MAP = {"physician": GROUP_DOCTOR}
# Old groups with no equivalent: reported, never silently re-roled.
_RETIRED_ROLES = ("compliance", "patient")

_OLD_SYSTEM_GROUPS = {
    "system-physician": SYSTEM_GROUPS[GROUP_DOCTOR]["id"],
}


def _migrate_user(user: dict, *, dry_run: bool) -> str:
    """Returns a one-line report of what happened (or would happen)."""
    username = user.get("username", "?")
    old_role = user.get("cognitoGroup", "")

    if old_role in ROLES:
        return f"  ok        {username:<24} already '{old_role}'"

    if old_role in _RETIRED_ROLES:
        return (
            f"  ATTENTION {username:<24} was '{old_role}' — that role no longer "
            "exists; re-role or disable this account in /admin"
        )

    new_role = _ROLE_MAP.get(old_role)
    if new_role is None:
        return f"  ATTENTION {username:<24} unknown role '{old_role}' — left untouched"

    custom_groups = [
        _OLD_SYSTEM_GROUPS.get(group_id, group_id) for group_id in user.get("customGroups", [])
    ]
    # De-duplicate while preserving order, in case both ids were present.
    custom_groups = list(dict.fromkeys(custom_groups))

    if dry_run:
        return f"  would map {username:<24} '{old_role}' -> '{new_role}'"

    try:
        cognito_admin.add_to_group(username, new_role)
    except AppError as exc:  # the account may have been deleted from the pool
        return f"  SKIPPED   {username:<24} Cognito update failed: {exc}"

    users_repo.update_user(user["sub"], cognito_group=new_role, custom_groups=custom_groups)
    return f"  migrated  {username:<24} '{old_role}' -> '{new_role}'"


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate accounts to the doctor/nurse/admin roles.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Report what would change without writing anything."
    )
    args = parser.parse_args()

    print("Seeding system permission groups...")
    if args.dry_run:
        print("  (skipped in --dry-run)")
    else:
        _seed_system_groups()

    print("\nMigrating accounts...")
    users = users_repo.list_users()
    if not users:
        print("  (no user records found)")
    reports = [_migrate_user(user, dry_run=args.dry_run) for user in users]
    for line in reports:
        print(line)

    needs_attention = [line for line in reports if "ATTENTION" in line or "SKIPPED" in line]
    print(f"\nDone. {len(users)} account(s) examined.")
    if needs_attention:
        print(
            f"{len(needs_attention)} account(s) need a decision — they can sign in but "
            "have no role, so they can reach nothing until an admin re-roles or "
            "disables them."
        )


if __name__ == "__main__":
    main()
