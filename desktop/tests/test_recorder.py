"""Tests for microphone capture, driven by a stand-in audio stream.

The recording loop is the least testable part of Mairo on a build machine and
the first thing a user touches, so it is exercised here with scripted audio
instead of a real microphone.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("MAIRO_HOME", tempfile.mkdtemp(prefix="mairo-recorder-tests-"))

import numpy as np  # noqa: E402

from app.utils.errors import VoiceError  # noqa: E402
from app.voice.recorder import BLOCK_SIZE, SAMPLE_RATE, Recorder  # noqa: E402

BLOCKS_PER_SECOND = SAMPLE_RATE / BLOCK_SIZE


def silence(blocks: int) -> list[np.ndarray]:
    return [np.zeros((BLOCK_SIZE, 1), dtype=np.int16) for _ in range(blocks)]


def speech(blocks: int, amplitude: int = 8000) -> list[np.ndarray]:
    """Blocks loud enough to count as someone talking."""
    tone = (np.sin(np.linspace(0, 40, BLOCK_SIZE)) * amplitude).astype(np.int16)
    return [tone.reshape(-1, 1) for _ in range(blocks)]


class FakeStream:
    """Replays scripted blocks, then silence for ever."""

    def __init__(self, blocks):
        self.blocks = list(blocks)
        self.reads = 0
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.closed = True
        return False

    def read(self, frames):
        self.reads += 1
        if self.blocks:
            return self.blocks.pop(0), False
        return np.zeros((frames, 1), dtype=np.int16), False


class fake_audio:
    """Installs a stand-in sounddevice module for the duration of a block."""

    def __init__(self, stream):
        self.stream = stream

    def __enter__(self):
        outer = self

        class FakeModule:
            @staticmethod
            def InputStream(**kwargs):  # noqa: N802 - mirrors the real name
                outer.kwargs = kwargs
                return outer.stream

        self._previous = sys.modules.get("sounddevice")
        sys.modules["sounddevice"] = FakeModule
        return self

    def __exit__(self, *exc):
        if self._previous is not None:
            sys.modules["sounddevice"] = self._previous
        else:
            sys.modules.pop("sounddevice", None)
        return False


class RecordingTests(unittest.TestCase):
    def test_speech_then_silence_writes_a_wav(self):
        blocks = silence(2) + speech(int(BLOCKS_PER_SECOND * 2)) + silence(int(BLOCKS_PER_SECOND * 3))
        recorder = Recorder()
        with fake_audio(FakeStream(blocks)):
            path = recorder.record(max_seconds=20, silence_seconds=1.0)
        self.assertTrue(path.exists())
        self.assertGreater(path.stat().st_size, 44)  # more than a bare WAV header
        self.assertFalse(recorder.is_recording)

    def test_it_stops_soon_after_the_speaker_does(self):
        """A trailing pause should end the recording, not run to the limit."""
        blocks = speech(int(BLOCKS_PER_SECOND)) + silence(int(BLOCKS_PER_SECOND * 15))
        stream = FakeStream(blocks)
        recorder = Recorder()
        with fake_audio(stream):
            recorder.record(max_seconds=20, silence_seconds=1.0)
        # One second of speech, one of silence, plus a little slack.
        self.assertLess(stream.reads, BLOCKS_PER_SECOND * 3)

    def test_saying_nothing_gives_up_quickly(self):
        """Clicking the microphone and not speaking must not record for 20 seconds."""
        recorder = Recorder()
        stream = FakeStream(silence(int(BLOCKS_PER_SECOND * 30)))
        with fake_audio(stream):
            with self.assertRaises(VoiceError) as caught:
                recorder.record(max_seconds=20, silence_seconds=1.5)
        self.assertIn("Nothing was heard", caught.exception.message)
        seconds_recorded = stream.reads / BLOCKS_PER_SECOND
        self.assertLess(
            seconds_recorded,
            8,
            f"waited {seconds_recorded:.1f}s of silence before giving up",
        )

    def test_stopping_before_the_thread_starts_is_not_lost(self):
        """The stop button is pressed on the interface thread, mid-startup."""
        recorder = Recorder()
        stream = FakeStream(speech(int(BLOCKS_PER_SECOND * 20)))
        recorder.stop()  # the user clicked stop before recording really began
        with fake_audio(stream):
            try:
                recorder.record(max_seconds=20, silence_seconds=1.5)
            except VoiceError:
                pass
        self.assertLess(
            stream.reads,
            BLOCKS_PER_SECOND * 2,
            "the stop was swallowed and recording carried on",
        )

    def test_the_level_meter_follows_the_audio(self):
        levels: list[float] = []
        blocks = silence(3) + speech(int(BLOCKS_PER_SECOND)) + silence(int(BLOCKS_PER_SECOND * 2))
        with fake_audio(FakeStream(blocks)):
            Recorder().record(max_seconds=20, silence_seconds=1.0, on_level=levels.append)
        self.assertTrue(levels)
        self.assertAlmostEqual(levels[0], 0.0, places=3)
        self.assertGreater(max(levels), 0.05, "speech should register on the meter")
        self.assertAlmostEqual(levels[-1], 0.0, places=3)  # reset when finished

    def test_a_zero_silence_setting_does_not_end_it_instantly(self):
        blocks = speech(int(BLOCKS_PER_SECOND * 2)) + silence(int(BLOCKS_PER_SECOND * 5))
        stream = FakeStream(blocks)
        with fake_audio(stream):
            Recorder().record(max_seconds=20, silence_seconds=0.0)
        self.assertGreater(stream.reads, BLOCKS_PER_SECOND, "it cut off the speaker")

    def test_a_missing_audio_system_is_a_readable_error(self):
        previous = sys.modules.pop("sounddevice", None)
        sys.modules["sounddevice"] = None  # import raises
        try:
            with self.assertRaises(VoiceError) as caught:
                Recorder().record()
            self.assertIn("audio", caught.exception.message.lower())
        finally:
            if previous is not None:
                sys.modules["sounddevice"] = previous
            else:
                sys.modules.pop("sounddevice", None)

    def test_the_recording_flag_clears_after_a_failure(self):
        recorder = Recorder()
        with fake_audio(FakeStream(silence(int(BLOCKS_PER_SECOND * 30)))):
            with self.assertRaises(VoiceError):
                recorder.record(max_seconds=20, silence_seconds=1.5)
        self.assertFalse(recorder.is_recording)


if __name__ == "__main__":
    unittest.main(verbosity=2)
