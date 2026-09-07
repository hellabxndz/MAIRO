"""The slide-in panel listing saved conversations."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from app.ai.conversation import ConversationStore
from app.ui.theme import Palette

PANEL_WIDTH = 290


class HistoryPanel(QWidget):
    """Browse, open, delete: everything the user can do with past chats."""

    conversation_opened = Signal(int)
    new_conversation_requested = Signal()
    history_cleared = Signal()

    def __init__(
        self, conversations: ConversationStore, palette: Palette, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self.setObjectName("historyPanel")
        # A plain QWidget subclass ignores stylesheet backgrounds without this.
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.conversations = conversations
        self.palette_colors = palette
        self.setMinimumWidth(PANEL_WIDTH)

        header = QLabel("CONVERSATIONS")
        header.setProperty("role", "subtitle")
        header.setStyleSheet(f"color: {palette.text_dim}; letter-spacing: 3px; font-size: 11px;")

        self.list = QListWidget()
        self.list.itemActivated.connect(self._open_selected)
        self.list.itemClicked.connect(self._open_selected)

        self.new_button = QPushButton("New conversation")
        self.new_button.setProperty("role", "primary")
        self.new_button.clicked.connect(self.new_conversation_requested.emit)

        self.delete_button = QPushButton("Delete")
        self.delete_button.clicked.connect(self._delete_selected)
        self.clear_button = QPushButton("Clear all")
        self.clear_button.setProperty("role", "danger")
        self.clear_button.clicked.connect(self._clear_all)

        buttons = QHBoxLayout()
        buttons.setSpacing(8)
        buttons.addWidget(self.delete_button)
        buttons.addWidget(self.clear_button)

        self.empty_label = QLabel("No saved conversations yet.")
        self.empty_label.setAlignment(Qt.AlignCenter)
        self.empty_label.setStyleSheet(f"color: {palette.text_dim}; font-size: 12px;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 18, 14, 22)
        layout.setSpacing(11)
        layout.addWidget(header)
        layout.addWidget(self.new_button)
        layout.addWidget(self.list, 1)
        layout.addWidget(self.empty_label, 1)
        layout.addLayout(buttons)

        self.apply_palette(palette)
        self.refresh()

    # ---------------------------------------------------------------- data

    def refresh(self) -> None:
        self.list.clear()
        rows = self.conversations.list_conversations()
        for row in rows:
            label = f"{row['title']}\n{row['updated_at'][:16]}  ·  {row['message_count']} messages"
            item = QListWidgetItem(label)
            item.setData(Qt.UserRole, row["id"])
            self.list.addItem(item)
        has_rows = bool(rows)
        self.empty_label.setVisible(not has_rows)
        self.list.setVisible(has_rows)
        self.delete_button.setEnabled(has_rows)
        self.clear_button.setEnabled(has_rows)

    def _selected_id(self) -> int | None:
        item = self.list.currentItem()
        return int(item.data(Qt.UserRole)) if item else None

    # ------------------------------------------------------------- actions

    def _open_selected(self, item: QListWidgetItem) -> None:
        self.conversation_opened.emit(int(item.data(Qt.UserRole)))

    def _delete_selected(self) -> None:
        conversation_id = self._selected_id()
        if conversation_id is None:
            return
        confirm = QMessageBox.question(
            self,
            "Delete conversation",
            "Delete this conversation permanently?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )
        if confirm == QMessageBox.Yes:
            self.conversations.delete(conversation_id)
            self.refresh()
            self.history_cleared.emit()

    def _clear_all(self) -> None:
        confirm = QMessageBox.question(
            self,
            "Clear all history",
            "Delete every saved conversation? Memories and notes are not affected.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )
        if confirm == QMessageBox.Yes:
            self.conversations.delete_all()
            self.refresh()
            self.history_cleared.emit()

    # -------------------------------------------------------------- styling

    def apply_palette(self, palette: Palette) -> None:
        self.palette_colors = palette
        # Matches the framing of the other HUD panels.
        red, green, blue = (int(palette.panel.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
        self.setStyleSheet(
            f"""
            QWidget#historyPanel {{
                background-color: rgba({red}, {green}, {blue}, 0.65);
                border: 1px solid {palette.border};
                border-radius: 10px;
            }}
            """
        )
        self.empty_label.setStyleSheet(f"color: {palette.text_dim}; font-size: 12px;")
