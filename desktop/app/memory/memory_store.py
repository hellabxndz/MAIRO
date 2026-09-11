"""Long-lived facts the user asked Mairo to remember.

Deliberately separate from conversation history: clearing chats never erases
preferences, and preferences are the only thing injected into every prompt.
"""

from __future__ import annotations

import re

from app.database.db import Database
from app.utils.logging_setup import get_logger

log = get_logger("memory")

MAX_MEMORIES_IN_PROMPT = 25


def normalise_key(key: str) -> str:
    """Turn a spoken phrase into a stable lookup key."""
    slug = re.sub(r"[^a-z0-9]+", "_", key.strip().lower()).strip("_")
    return slug[:60] or "note"


class MemoryStore:
    """CRUD over the `memories` table."""

    def __init__(self, db: Database) -> None:
        self.db = db

    def remember(self, key: str, value: str, category: str = "preference") -> str:
        stored_key = normalise_key(key)
        self.db.execute(
            """
            INSERT INTO memories (key, value, category) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                category = excluded.category,
                updated_at = datetime('now')
            """,
            (stored_key, value.strip(), category.strip() or "preference"),
        )
        log.info("Stored memory %s", stored_key)
        return stored_key

    def forget(self, key: str) -> bool:
        stored_key = normalise_key(key)
        cursor = self.db.execute("DELETE FROM memories WHERE key = ?", (stored_key,))
        if cursor.rowcount:
            return True
        # Fall back to a loose match so "forget my favourite browser" works.
        row = self.db.query_one(
            "SELECT key FROM memories WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC",
            (f"%{stored_key}%", f"%{key.strip()}%"),
        )
        if row is None:
            return False
        self.db.execute("DELETE FROM memories WHERE key = ?", (row["key"],))
        return True

    def all(self) -> list[dict]:
        rows = self.db.query("SELECT * FROM memories ORDER BY updated_at DESC")
        return [dict(row) for row in rows]

    def search(self, term: str) -> list[dict]:
        if not term.strip():
            return self.all()
        like = f"%{term.strip()}%"
        rows = self.db.query(
            "SELECT * FROM memories WHERE key LIKE ? OR value LIKE ? OR category LIKE ?"
            " ORDER BY updated_at DESC",
            (like, like, like),
        )
        return [dict(row) for row in rows]

    def get(self, key: str) -> str | None:
        row = self.db.query_one("SELECT value FROM memories WHERE key = ?", (normalise_key(key),))
        return row["value"] if row else None

    def clear(self) -> int:
        cursor = self.db.execute("DELETE FROM memories")
        return cursor.rowcount

    def summary(self, limit: int = MAX_MEMORIES_IN_PROMPT) -> str:
        """Compact bullet list injected into the system prompt."""
        rows = self.db.query(
            "SELECT key, value, category FROM memories ORDER BY updated_at DESC LIMIT ?",
            (limit,),
        )
        if not rows:
            return ""
        return "\n".join(f"- [{row['category']}] {row['key']}: {row['value']}" for row in rows)

    def preferred_name(self) -> str:
        for key in ("preferred_name", "name", "my_name", "user_name"):
            value = self.get(key)
            if value:
                return value
        return ""
