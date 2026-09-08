"""Microphone capture.

Records to a temporary 16 kHz mono WAV, which is what every speech service
wants. Recording stops when the user clicks again, when the clip reaches the
configured maximum, or after a stretch of silence.
"""

from __future__ import annotations

import threading
import wave
from pathlib import Path
from typing import Callable

from app.config.paths import temp_dir
from app.utils.errors import VoiceError
from app.utils.logging_setup import get_logger

log = get_logger("voice.recorder")

SAMPLE_RATE = 16_000
CHANNELS = 1
BLOCK_SIZE = 1024
SILENCE_THRESHOLD = 0.012  # RMS below this counts as silence
MIN_SPEECH_SECONDS = 0.6
# How long to wait for the speaker to begin before giving up. Without this, a
# user who clicks the microphone and hesitates waits out the whole recording
# limit for an error.
INITIAL_SILENCE_SECONDS = 5.0


def _sounddevice():
    """Import sounddevice lazily so a machine with no audio can still start Mairo."""
    try:
        import sounddevice as sd
    except (ImportError, OSError) as exc:
        raise VoiceError(
            "No audio system is available on this computer.",
            hint="Install the requirements again, or check that a microphone is connected.",
        ) from exc
    return sd


def list_input_devices() -> list[tuple[int, str]]:
    """Available microphones as (index, label). Empty when there is no audio stack."""
    try:
        sd = _sounddevice()
        devices = sd.query_devices()
    except Exception as exc:
        log.warning("Could not list input devices: %s", exc)
        return []
    found = []
    for index, device in enumerate(devices):
        if int(device.get("max_input_channels", 0)) > 0:
            found.append((index, str(device.get("name", f"Device {index}"))))
    return found


def default_input_device() -> int | None:
    try:
        sd = _sounddevice()
        default = sd.default.device
        index = default[0] if isinstance(default, (list, tuple)) else default
        return int(index) if index is not None and int(index) >= 0 else None
    except Exception:
        return None


def microphone_available(device: int | None = None) -> tuple[bool, str]:
    """Open a short test stream so first-run setup can report a real answer."""
    try:
        sd = _sounddevice()
    except VoiceError as exc:
        return False, exc.display()
    devices = list_input_devices()
    if not devices:
        return False, "No microphone was detected on this computer."
    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE, channels=CHANNELS, device=device, blocksize=BLOCK_SIZE
        ):
            pass
    except Exception as exc:
        return False, f"The microphone could not be opened: {exc}"
    label = dict(devices).get(device if device is not None else devices[0][0], devices[0][1])
    return True, f"Microphone ready: {label}"


class Recorder:
    """Records one clip at a time and reports its live level."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._recording = False

    @property
    def is_recording(self) -> bool:
        return self._recording

    def arm(self) -> None:
        """Clear a stale stop before a recording begins.

        This runs on the interface thread, before the worker starts, so a stop
        the user presses during startup cannot be cleared out from under them.
        """
        self._stop.clear()

    def stop(self) -> None:
        self._stop.set()

    def record(
        self,
        device: int | None = None,
        max_seconds: int = 20,
        silence_seconds: float = 1.6,
        on_level: Callable[[float], None] | None = None,
    ) -> Path:
        """Capture until stopped, silent or out of time, and return the WAV path."""
        import numpy as np

        sd = _sounddevice()
        self._recording = True
        frames: list[bytes] = []
        heard_speech = False
        silent_blocks = 0
        blocks_per_second = SAMPLE_RATE / BLOCK_SIZE
        silence_limit = max(1, int(silence_seconds * blocks_per_second))
        opening_limit = max(1, int(INITIAL_SILENCE_SECONDS * blocks_per_second))
        max_blocks = int(max_seconds * blocks_per_second)

        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="int16",
                device=device,
                blocksize=BLOCK_SIZE,
            ) as stream:
                for _ in range(max_blocks):
                    if self._stop.is_set():
                        break
                    block, overflowed = stream.read(BLOCK_SIZE)
                    if overflowed:
                        log.debug("Input overflow while recording")
                    frames.append(bytes(block))

                    samples = np.frombuffer(bytes(block), dtype=np.int16).astype(np.float32) / 32768.0
                    level = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
                    if on_level:
                        on_level(level)

                    if level > SILENCE_THRESHOLD:
                        heard_speech = True
                        silent_blocks = 0
                    else:
                        silent_blocks += 1
                        # A pause after speaking ends the turn; silence before
                        # any speech gives up sooner, rather than recording
                        # nothing until the limit.
                        if silent_blocks >= (silence_limit if heard_speech else opening_limit):
                            break
        except VoiceError:
            raise
        except Exception as exc:
            log.warning("Recording failed: %s", exc)
            raise VoiceError(
                "The microphone could not be used.",
                hint="Check Windows Settings › Privacy › Microphone, then try again.",
            ) from exc
        finally:
            self._recording = False
            if on_level:
                on_level(0.0)

        duration = len(frames) * BLOCK_SIZE / SAMPLE_RATE
        if not frames or duration < MIN_SPEECH_SECONDS or not heard_speech:
            raise VoiceError(
                "Nothing was heard.", hint="Hold the microphone button and speak clearly."
            )

        path = temp_dir() / "capture.wav"
        with wave.open(str(path), "wb") as handle:
            handle.setnchannels(CHANNELS)
            handle.setsampwidth(2)
            handle.setframerate(SAMPLE_RATE)
            handle.writeframes(b"".join(frames))
        log.info("Recorded %.1f seconds of audio", duration)
        return path
