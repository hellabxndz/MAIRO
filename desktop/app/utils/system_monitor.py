"""Live machine readings for the HUD panels.

Everything here is real: processor load, memory, disk, uptime and network
throughput come from the operating system. When psutil is not installed the
monitor still reports what the standard library can measure and marks the rest
as unavailable, so a panel shows a dash rather than an invented number.
"""

from __future__ import annotations

import shutil
import time
from dataclasses import dataclass
from pathlib import Path

from PySide6.QtCore import QObject, QTimer, Signal

from app.utils.logging_setup import get_logger

log = get_logger("system")

POLL_MS = 1500

try:  # psutil is optional; the HUD degrades honestly without it.
    import psutil
except ImportError:  # pragma: no cover - exercised on machines without psutil
    psutil = None


@dataclass
class SystemReading:
    """One snapshot. `None` means "this machine will not tell us"."""

    cpu_percent: float | None = None
    memory_percent: float | None = None
    memory_used_gb: float | None = None
    memory_total_gb: float | None = None
    disk_percent: float | None = None
    disk_free_gb: float | None = None
    disk_total_gb: float | None = None
    uptime_seconds: float | None = None
    download_kbps: float | None = None
    upload_kbps: float | None = None

    @property
    def uptime_text(self) -> str:
        if self.uptime_seconds is None:
            return "—"
        total = int(self.uptime_seconds)
        days, rest = divmod(total, 86_400)
        hours, rest = divmod(rest, 3_600)
        minutes = rest // 60
        if days:
            return f"{days}d {hours}h"
        if hours:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"


def _home_drive() -> str:
    """The drive Windows users think of as "the" disk, or / elsewhere."""
    return str(Path.home().anchor or Path.home())


class SystemMonitor(QObject):
    """Polls the machine on a timer and hands out readings."""

    updated = Signal(object)  # SystemReading

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.available = psutil is not None
        self._last_net: tuple[float, int, int] | None = None
        self.latest = SystemReading()

        if not self.available:
            log.info("psutil is not installed; the HUD will show disk and clock only")

        self._timer = QTimer(self)
        self._timer.timeout.connect(self.poll)
        self._timer.start(POLL_MS)
        QTimer.singleShot(0, self.poll)

    def stop(self) -> None:
        self._timer.stop()

    def poll(self) -> None:
        reading = SystemReading()

        # Disk works everywhere, with or without psutil.
        try:
            usage = shutil.disk_usage(_home_drive())
            reading.disk_total_gb = usage.total / 1_073_741_824
            reading.disk_free_gb = usage.free / 1_073_741_824
            reading.disk_percent = (usage.used / usage.total * 100) if usage.total else None
        except OSError as exc:
            log.debug("Disk reading failed: %s", exc)

        if psutil is not None:
            try:
                reading.cpu_percent = float(psutil.cpu_percent(interval=None))
                memory = psutil.virtual_memory()
                reading.memory_percent = float(memory.percent)
                reading.memory_used_gb = memory.used / 1_073_741_824
                reading.memory_total_gb = memory.total / 1_073_741_824
                reading.uptime_seconds = max(0.0, time.time() - psutil.boot_time())
                reading.download_kbps, reading.upload_kbps = self._network_rates()
            except Exception as exc:  # a locked-down machine can refuse any of these
                log.debug("System reading partially failed: %s", exc)

        self.latest = reading
        self.updated.emit(reading)

    def _network_rates(self) -> tuple[float | None, float | None]:
        """Kilobytes per second since the previous poll."""
        if psutil is None:
            return None, None
        try:
            counters = psutil.net_io_counters()
        except Exception:
            return None, None
        now = time.monotonic()
        current = (now, counters.bytes_recv, counters.bytes_sent)
        if self._last_net is None:
            self._last_net = current
            return 0.0, 0.0
        elapsed = now - self._last_net[0]
        if elapsed <= 0:
            return 0.0, 0.0
        down = max(0.0, (counters.bytes_recv - self._last_net[1]) / elapsed / 1024)
        up = max(0.0, (counters.bytes_sent - self._last_net[2]) / elapsed / 1024)
        self._last_net = current
        return down, up
