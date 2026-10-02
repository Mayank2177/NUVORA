#!/usr/bin/env python3
"""Clean up test users from the database."""
import sqlite3
import sys
from pathlib import Path

db_path = Path(__file__).parent / "data" / "nuvora.sqlite3"

if not db_path.exists():
    print(f"Database not found at {db_path}")
    sys.exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.execute("DELETE FROM users WHERE email LIKE 'test%@example.com'")
deleted = cursor.rowcount
conn.commit()
conn.close()

print(f"Deleted {deleted} test user(s) from the database")
