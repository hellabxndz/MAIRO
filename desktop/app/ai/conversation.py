"""Local conversation history.

Only the tail of the current conversation is ever sent to the model; the rest
stays on disk for the user to browse or delete.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.database.db import Database
from app.utils.logging_setup import get_logger

log = get_logger("conversation")

TITLE_LENGTH = 48


@dataclass
class StoredMessage:
    role: str
    content: str
    created_at: str = ""


class ConversationStore:
    """Conversations and their messages, newest conversation first."""

    def __init__(self, db: Database, enabled: bool = True) -> None:
        self.db = db
        self.enabled = enabled
        self._current_id: int | None = None
        self._pending: list[StoredMessage] = []

    # ------------------------------------------------------------- lifecycle

    @property
    def current_id(self) -> int | None:
        return self._current_id

    def start_new(self) -> None:
        """Begin a fresh conversation. The row is created on the first message."""
        self._current_id = None
        self._pending = []

    def open(self, conversation_id: int) -> list[StoredMessage]:
        self._current_id = conversation_id
        self._pending = []
        return self.messages(conversation_id)

    def set_enabled(self, enabled: bool) -> None:
        self.enabled = enabled

    # -------------------------------------------------------------- writing

    def add(self, role: str, content: str) -> None:
        if not content.strip():
            return
        message = StoredMessage(role=role, content=content)
        if not self.enabled:
            # History saving is off: keep the turn in memory for context only.
            self._pending.append(message)
            self._pending = self._pending[-40:]
            return
        if self._current_id is None:
            title = content.strip().replace("\n", " ")[:TITLE_LENGTH] or "New conversation"
            cursor = self.db.execute("INSERT INTO conversations (title) VALUES (?)", (title,))
            self._current_id = int(cursor.lastrowid)
        self.db.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (self._current_id, role, content),
        )
        self.db.execute(
            "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
            (self._current_id,),
        )

    # -------------------------------------------------------------- reading

    def recent_context(self, limit: int = 12) -> list[StoredMessage]:
        """The last `limit` user/assistant turns of the current conversation."""
        if not self.enabled or self._current_id is None:
            return self._pending[-limit:]
        rows = self.db.query(
            "SELECT role, content, created_at FROM messages"
            " WHERE conversation_id = ? AND role IN ('user', 'assistant')"
            " ORDER BY id DESC LIMIT ?",
            (self._current_id, limit),
        )
        return [StoredMessage(r["role"], r["content"], r["created_at"]) for r in reversed(rows)]

    def messages(self, conversation_id: int) -> list[StoredMessage]:
        rows = self.db.query(
            "SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
            (conversation_id,),
        )
        return [StoredMessage(r["role"], r["content"], r["created_at"]) for r in rows]

    def list_conversations(self, limit: int = 100) -> list[dict]:
        rows = self.db.query(
            "SELECT c.id, c.title, c.updated_at, COUNT(m.id) AS message_count"
            " FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id"
            " GROUP BY c.id ORDER BY c.updated_at DESC LIMIT ?",
            (limit,),
        )
        return [dict(row) for row in rows]

    # -------------------------------------------------------------- deleting

    def delete(self, conversation_id: int) -> None:
        self.db.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
        self.db.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        if self._current_id == conversation_id:
            self.start_new()

    def delete_all(self) -> None:
        self.db.execute("DELETE FROM messages")
        self.db.execute("DELETE FROM conversations")
        self.start_new()
