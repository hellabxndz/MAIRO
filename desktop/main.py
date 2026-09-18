"""Mairo — launch the desktop assistant.

    python main.py

Wires the pieces together (settings, database, memory, tools, model, voice)
and hands them to the window. Anything that goes wrong before the window
exists is reported in a dialog rather than a stack trace.
"""

from __future__ import annotations

import logging
import sys
import traceback
from pathlib import Path

# Allow `python main.py` from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config.settings import Settings, load_environment  # noqa: E402
from app.utils.logging_setup import setup_logging  # noqa: E402


def build_application():
    """Create the QApplication with Mairo's identity applied."""
    from PySide6.QtGui import QFont
    from PySide6.QtWidgets import QApplication

    application = QApplication(sys.argv)
    application.setApplicationName("Mairo")
    application.setApplicationDisplayName("Mairo")
    application.setOrganizationName("Mairo")
    application.setFont(QFont("Segoe UI", 10))
    return application


def build_window(settings: Settings):
    """Assemble the assistant's services and the main window."""
    from app.ai.brain import Brain
    from app.ai.conversation import ConversationStore
    from app.ai.openai_provider import OpenAIProvider
    from app.database.db import Database
    from app.memory.memory_store import MemoryStore
    from app.tools.base import ToolContext
    from app.tools.registry import build_default_registry
    from app.ui.main_window import MainWindow
    from app.voice.manager import VoiceManager

    database = Database()
    memory = MemoryStore(database)
    conversations = ConversationStore(database, enabled=settings.save_history)
    conversations.start_new()

    tools = build_default_registry(ToolContext(settings=settings, memory=memory, db=database))
    provider = OpenAIProvider(settings)
    brain = Brain(provider, tools, memory, conversations, settings)
    voice = VoiceManager(settings)

    window = MainWindow(settings, brain, voice, conversations, memory)
    window.database = database  # the window owns the connection for its lifetime
    return window


def install_exception_hook(log: logging.Logger) -> None:
    """Log unexpected errors instead of letting the app disappear."""

    def hook(exc_type, exc_value, exc_traceback) -> None:
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        log.error(
            "Unhandled error: %s",
            "".join(traceback.format_exception(exc_type, exc_value, exc_traceback)),
        )

    sys.excepthook = hook


def main() -> int:
    log = setup_logging()
    load_environment()
    settings = Settings.load()
    log.info("Starting Mairo with model %s", settings.active_model)

    try:
        application = build_application()
    except ImportError:
        print(
            "PySide6 is not installed.\n"
            "Activate your virtual environment and run:\n"
            "    pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    install_exception_hook(log)

    try:
        window = build_window(settings)
    except Exception as exc:
        log.exception("Mairo could not start")
        from PySide6.QtWidgets import QMessageBox

        QMessageBox.critical(
            None,
            "Mairo could not start",
            f"{exc}\n\nThe full details are in the log file.",
        )
        return 1

    window.show()
    return application.exec()


if __name__ == "__main__":
    sys.exit(main())
