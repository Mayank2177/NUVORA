"""Server-side administration commands."""
from __future__ import annotations

import argparse

from storage.instance import get_storage
from storage.utils import utc_now_iso


def main() -> None:
    parser = argparse.ArgumentParser(prog="nuvora-admin")
    parser.add_argument("action", choices=("promote", "demote"))
    parser.add_argument("email", help="Existing NUVORA account email")
    args = parser.parse_args()

    email = args.email.strip().lower()
    storage = get_storage()
    try:
        user = storage.get_user_by_email(email)
        if not user:
            parser.error(f"No active user found for {email}")
        is_admin = 1 if args.action == "promote" else 0
        storage.execute(
            "UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?",
            (is_admin, utc_now_iso(), user["id"]),
        )
        print(f"{email}: admin={bool(is_admin)}")
    finally:
        storage.close()
        get_storage.cache_clear()


if __name__ == "__main__":
    main()