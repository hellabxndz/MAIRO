"""Application logging with secret redaction.

Logs go to a rotating file in the user's Mairo data directory and to stderr.
A filter scrubs anything that looks like a key or token before it is written,
so log files can be shared when reporting a bug.
"""

from __future__ import annotations

import logging
import logging.handlers
import re
import sys

from app.config.paths import logs_dir

# Order matters: the bearer pattern has to run before the generic key/value one,
# which would otherwise consume "Authorization: Bearer" and leave the token.
_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)\b(authorization|proxy-authorization)\b\s*[:=]\s*\S+(\s+\S+)?"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"),
    re.compile(r"(?i)\b(api[_-]?key|password|token|secret)\b\s*[:=]\s*\S+"),
]

_configured = False


class RedactingFilter(logging.Filter):
    """Replaces credential-looking substrings with a placeholder."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.msg = self.redact(record.getMessage())
            record.args = ()
        except Exception:  # never let logging break the app
            pass
        return True

    @staticmethod
    def redact(text: str) -> str:
        for pattern in _SECRET_PATTERNS:
            text = pattern.sub("[redacted]", text)
        return text


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure the root logger once and return Mairo's logger."""
    global _configured
    root = logging.getLogger()
    if _configured:
        return logging.getLogger("mairo")

    root.setLevel(level)
    fmt = logging.Formatter("%(asctime)s  %(levelname)-7s  %(name)s  %(message)s")
    redactor = RedactingFilter()

    try:
        file_handler = logging.handlers.RotatingFileHandler(
            logs_dir() / "mairo.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8"
        )
        file_handler.setFormatter(fmt)
        file_handler.addFilter(redactor)
        root.addHandler(file_handler)
    except OSError:
        pass  # a read-only disk must not stop the app from starting

    stream = logging.StreamHandler(sys.stderr)
    stream.setFormatter(fmt)
    stream.addFilter(redactor)
    root.addHandler(stream)

    # Third-party libraries are chatty at INFO and can echo request bodies.
    for noisy in ("openai", "httpx", "httpcore", "urllib3", "comtypes"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _configured = True
    return logging.getLogger("mairo")


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"mairo.{name}")
