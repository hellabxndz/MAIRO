"""The rolling transcript: what the user said and what Mairo replied."""

from __future__ import annotations

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import (
    QFrame,
    QMenu,
    QLabel,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from app.ui.theme import Palette


def translucent(hex_color: str, alpha: float) -> str:
    """Turn "#101426" into an rgba() string Qt stylesheets understand."""
    value = hex_color.lstrip("#")
    red, green, blue = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    return f"rgba({red}, {green}, {blue}, {alpha:.2f})"

# Long sessions would otherwise keep a widget per message for ever; the full
# conversation is still on disk and in the history panel.
MAX_VISIBLE_MESSAGES = 200

USER = "user"
MAIRO = "assistant"
SYSTEM = "system"
ERROR = "error"
ACTION = "action"


class MessageBubble(QFrame):
    """One line of the conversation."""

    def __init__(self, kind: str, text: str, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("bubble")
        self.kind = kind
        self.palette_colors = palette

        self.speaker = QLabel(self._speaker_label(kind))
        self.speaker.setStyleSheet("letter-spacing: 2px; font-size: 10px; font-weight: 700;")
        self.body = QLabel(text)
        self.body.setWordWrap(True)
        self.body.setTextInteractionFlags(
            Qt.TextSelectableByMouse | Qt.TextSelectableByKeyboard
        )
        self.body.setCursor(Qt.IBeamCursor)
        self.setContextMenuPolicy(Qt.DefaultContextMenu)
        self.body.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Minimum)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(15, 11, 15, 12)
        layout.setSpacing(5)
        layout.addWidget(self.speaker)
        layout.addWidget(self.body)
        self.apply_palette(palette)

    @staticmethod
    def _speaker_label(kind: str) -> str:
        return {
            USER: "YOU",
            MAIRO: "MAIRO",
            SYSTEM: "SYSTEM",
            ERROR: "PROBLEM",
            ACTION: "ACTION",
        }.get(kind, kind.upper())

    def apply_palette(self, palette: Palette) -> None:
        self.palette_colors = palette
        accents = {
            USER: palette.secondary,
            MAIRO: palette.accent_soft,
            SYSTEM: palette.text_dim,
            ERROR: palette.danger,
            ACTION: palette.success,
        }
        accent = accents.get(self.kind, palette.text_dim)
        background = palette.panel if self.kind == USER else palette.panel_alt
        if self.kind in (ERROR, SYSTEM, ACTION):
            # Quieter than a real message, but still opaque enough to read
            # against the moving starfield behind it.
            background = translucent(palette.panel, 0.55)
        self.setStyleSheet(
            f"""
            QFrame#bubble {{
                background-color: {background};
                border: 1px solid {palette.border};
                border-left: 3px solid {accent};
                border-radius: 12px;
            }}
            QFrame#bubble QLabel {{
                background: transparent;
                border: none;
            }}
            """
        )
        self.speaker.setStyleSheet(
            f"color: {accent}; letter-spacing: 2px; font-size: 10px; font-weight: 700;"
        )
        body_color = palette.text if self.kind in (USER, MAIRO) else palette.text_dim
        self.body.setStyleSheet(f"color: {body_color}; font-size: 14px; line-height: 150%;")

    def set_text(self, text: str) -> None:
        self.body.setText(text)

    def contextMenuEvent(self, event) -> None:  # noqa: N802 - Qt naming
        """Right-click to copy, because selecting text alone is not obvious."""
        menu = QMenu(self)
        selection = self.body.selectedText()
        if selection:
            copy_selection = menu.addAction("Copy selection")
            copy_selection.triggered.connect(
                lambda: QGuiApplication.clipboard().setText(selection)
            )
        copy_all = menu.addAction("Copy message")
        copy_all.triggered.connect(
            lambda: QGuiApplication.clipboard().setText(self.body.text())
        )
        menu.exec(event.globalPos())


class TranscriptView(QScrollArea):
    """A scrolling column of bubbles that always shows the newest message."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.palette_colors = palette
        self._bubbles: list[MessageBubble] = []

        container = QWidget()
        container.setStyleSheet("background: transparent;")
        self._layout = QVBoxLayout(container)
        self._layout.setContentsMargins(2, 2, 10, 2)
        self._layout.setSpacing(9)
        # The stretch sits above the messages, so a short conversation rests at
        # the bottom of the panel and the newest line is always the one in view.
        self._layout.addStretch(1)

        self.setWidget(container)
        self.setWidgetResizable(True)
        self.verticalScrollBar().rangeChanged.connect(self._follow_new_content)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setFrameShape(QFrame.NoFrame)
        self.setStyleSheet("background: transparent;")

    def add_message(self, kind: str, text: str) -> MessageBubble:
        bubble = MessageBubble(kind, text, self.palette_colors)
        self._layout.addWidget(bubble)
        self._bubbles.append(bubble)
        self._trim()
        QTimer.singleShot(0, self._scroll_to_bottom)
        return bubble

    def _trim(self) -> None:
        """Drop the oldest bubbles once the view gets long."""
        while len(self._bubbles) > MAX_VISIBLE_MESSAGES:
            oldest = self._bubbles.pop(0)
            self._layout.removeWidget(oldest)
            oldest.setParent(None)
            oldest.deleteLater()

    def conversation_text(self) -> str:
        """The whole visible exchange, as plain text."""
        lines = []
        for bubble in self._bubbles:
            lines.append(f"{bubble.speaker.text()}: {bubble.body.text()}")
        return "\n\n".join(lines)

    def clear_messages(self) -> None:
        for bubble in self._bubbles:
            self._layout.removeWidget(bubble)
            bubble.deleteLater()
        self._bubbles = []

    def set_palette_colors(self, palette: Palette) -> None:
        self.palette_colors = palette
        for bubble in self._bubbles:
            bubble.apply_palette(palette)

    def _follow_new_content(self, _minimum: int, maximum: int) -> None:
        self.verticalScrollBar().setValue(maximum)

    def _scroll_to_bottom(self) -> None:
        bar = self.verticalScrollBar()
        bar.setValue(bar.maximum())


class EmptyState(QWidget):
    """The prompt shown before the first exchange of a conversation."""

    def __init__(self, palette: Palette, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.title = QLabel("Mairo is ready")
        self.title.setAlignment(Qt.AlignCenter)
        self.hint = QLabel(
            "Hold the microphone and speak, or type below.\n"
            "Try “open Spotify”, “search YouTube for lo-fi”, or “what time is it?”"
        )
        self.hint.setAlignment(Qt.AlignCenter)
        self.hint.setWordWrap(True)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 12, 0, 12)
        layout.setSpacing(7)
        layout.addWidget(self.title)
        layout.addWidget(self.hint)
        self.set_palette_colors(palette)

    def set_palette_colors(self, palette: Palette) -> None:
        self.title.setStyleSheet(
            f"color: {palette.text}; font-size: 16px; font-weight: 600; letter-spacing: 1px;"
        )
        self.hint.setStyleSheet(f"color: {palette.text_dim}; font-size: 13px; line-height: 160%;")


__all__ = ["TranscriptView", "MessageBubble", "EmptyState", "USER", "MAIRO", "SYSTEM", "ERROR", "ACTION"]
