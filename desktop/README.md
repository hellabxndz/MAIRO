# Mairo

Mairo is a local desktop assistant for Windows. It listens, answers out loud,
and operates the computer for you — opening apps, searching the web, taking
notes, adjusting volume, capturing the screen. It has its own look and its own
personality; it is not modelled on any film or franchise assistant.

Everything it remembers stays on your machine. Only the current request and a
short window of recent messages are ever sent to the AI provider.


## What you need

| Requirement | Notes |
|---|---|
| Windows 10 or 11, or macOS | Linux runs too, minus the platform extras |
| Python 3.10 or newer | On Windows, tick **Add python.exe to PATH** in the installer |
| An OpenAI API key | From <https://platform.openai.com/api-keys> |
| A microphone | Optional — you can type to Mairo instead |

## Install (exact commands)

### On Windows

Open **PowerShell** or **Command Prompt** in the folder that contains this
README, then run these six commands:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
notepad .env
python main.py
```

`notepad .env` opens the settings file. Put your key on the first line and
save:

```
OPENAI_API_KEY=sk-your-real-key-here
OPENAI_MODEL=gpt-4o-mini
```

That is the whole setup. Every later start is just:

```bat
.venv\Scripts\activate
python main.py
```

Or double-click **run_mairo.bat**, which does both and hides the console.

> If PowerShell refuses to run the activate script, use
> `.venv\Scripts\activate.bat`, or allow scripts once with
> `Set-ExecutionPolicy -Scope Process RemoteSigned`.

### On macOS

The same steps, with Unix paths. In Terminal, from this folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
open -e .env
python main.py
```

Put your key in the file that opens, save it, and run the last line again.

**To start it again later**, double-click **`run_mairo.command`** in the
`desktop` folder — Finder opens it in Terminal and Mairo starts. The first
time, macOS may refuse to run a downloaded script: right-click the file and
choose **Open**, then **Open** again on the warning, and it will trust it from
then on.

From a Terminal instead:

```bash
cd ~/MAIRO/desktop && source .venv/bin/activate && python main.py
```

Either way, keep the Terminal window that appears — closing it quits Mairo.

Works on Apple Silicon and Intel. On **macOS 13 (Ventura) or newer** you get
the current Qt; on macOS 11 or 12, pip automatically installs an older PySide6
(6.9) that still works.

macOS asks permission the first time Mairo uses something: allow **Microphone**
to talk to it, and **Screen Recording** if you ask for a screenshot. Both are
under System Settings › Privacy & Security. The Windows-only packages
(pywin32, pycaw, comtypes) are skipped automatically.

What differs on a Mac: the voice is the built-in `say` command, so every system
voice on your Mac is available and nothing extra is installed. Applications
open by their Mac names, and Windows names map to the Mac equivalent — asking
for Task Manager opens Activity Monitor, Notepad opens TextEdit, File Explorer
opens Finder. "Start with Windows" is the one setting that does nothing here.

## First run

The first launch walks through four short steps: a welcome, an API key check
(with instructions if the key is missing), a microphone test, and a voice
choice. You can change all of it later under **Settings**.

The window then opens.

## The layout

Mairo is a heads-up display in three columns. Every panel is labelled in plain
words and shows a real measurement — a reading this machine will not give up is
drawn as a dash, never a made-up number.

Across the top: the wordmark, a strip of every day in the current month with
today highlighted, and the History and Settings buttons.

**Left — what the computer is doing.**

| Panel | Shows |
|---|---|
| Time and date | A clock ring that fills with the passing minute, and a date ring that fills as the month goes by |
| This computer | Processor load, memory in use, disk in use with free space, how long the machine has been running |
| Assistant | The model Mairo is thinking with, the voice it speaks with, the recogniser it listens with, whether the wake word is on, how much it remembers, how many conversations are saved |

**Middle — Mairo itself.** A sphere of about nine hundred points of light,
rotated and projected every frame. It breathes when idle, blooms with your
voice while listening, draws tight while thinking, and a shockwave travels
through it when it speaks. Under it the waveform, the status line (Ready,
Listening, Thinking, Working, Speaking), and the box where you can type
instead of talking.

**The panels recede when you talk to it.** The moment Mairo starts listening,
thinking or speaking, both side columns fade back and what was said appears in
large type beneath the orb — dense when you are reading it, bare when you are
talking to it. When it returns to Ready, the HUD comes back.

**Right — talking and shortcuts.**

| Panel | Shows |
|---|---|
| Conversation | The running transcript: what you said, what Mairo replied, and every action it took |
| Quick actions | Six buttons that send a request for you, so you can see what Mairo understands without typing |
| Network | Download and upload throughput over the last minute and a half |

The History button swaps the right column for your saved conversations, so the
middle never gets squeezed. Opening one, or starting a new one, brings the
transcript back.

Processor, memory, uptime and network come from the `psutil` package, which
`requirements.txt` installs. Without it the app runs exactly the same and those
panels say so instead of guessing; the clock, disk and everything else are
unaffected.

## Talking to Mairo

Click **Hold to speak** (or press `Ctrl+M`), say your request, and stop
speaking — Mairo notices the silence, transcribes, answers, and speaks the
answer back. You can also type in the box at the bottom.

The six **Quick actions** buttons send a written-out request for you: time and
date, open Downloads, read notes, take a screenshot, what Mairo remembers, and
lock the screen. Hover one to see the exact words it sends. The last two go
through the same confirmation dialog as anything else risky.

The **speaker button** next to the microphone decides whether replies are read
out loud. Reading a long answer takes far longer than writing it, so when you
want the answer and not the performance, switch it off — the reply still
appears in the conversation the moment it is ready, and anything mid-sentence
stops at once. The choice is remembered, and `Ctrl+Shift+S` does the same
thing without reaching for the mouse.

Things it understands today:

- "Open Spotify." / "Open VS Code." / "Launch Discord."
- "Search YouTube for Travis Scott."
- "Search Google for AMG CLA 45."
- "Open my Downloads folder."
- "Take a screenshot."
- "What's on my clipboard?"
- "Turn my volume down." / "Set the volume to 20." / "Mute."
- "What's playing?" / "Skip this song." / "Play Redbone by Childish Gambino."
- "Create a note that says call Ivan tomorrow." / "Read my notes."
- "Remember that I always use Chrome." / "What do you remember about me?" /
  "Forget that preference."
- "What time is it?"
- "Read https://example.com/article and summarise it."
- "Lock my computer."

Anything that captures your screen, reads your clipboard, locks the machine or
deletes a memory asks you to confirm in a dialog first. Declining is final —
Mairo acknowledges and moves on rather than trying another way.

### Music

Mairo can see and steer whatever is playing — Apple Music, Spotify, a browser
tab — and can pull something out of the Apple Music catalogue to play.

- "What's playing?" / "Who sings this?"
- "Play." / "Pause." / "Skip this song." / "Go back."
- "Shuffle my music." / "Repeat this track."
- "Play Redbone by Childish Gambino." / "Play the album Blonde."
- "Open Apple Music."

On Windows this goes through the system's media transport controls — the same
thing your keyboard's play button talks to. It reaches only apps you already
have open and signed in, and it never sees your account, your password or your
library. Asking for a specific song looks the name up in Apple's public
catalogue (only the words you said are sent), opens the result in the Apple
Music app, and presses play only once the app is actually showing what you
asked for, so it can never start the wrong thing.

Reading what is playing needs the `winrt-*` packages in `requirements.txt`,
which install automatically on Windows. Without them Mairo falls back to the
media keys: play, pause and skip still work, but it cannot tell you what is on.

macOS is not wired up for this yet — there Mairo can open the Music app, and
nothing more.

### Reading web pages

Give Mairo a link and ask what is on it — "read this and summarise it" — and it
fetches the page and answers from the text. Public pages only; anything behind
a login comes back as an error.

Two things are deliberate. The address is checked before anything is opened:
only `http` and `https`, and never an address on your own machine or local
network, which is how an assistant gets talked into reading a router's admin
page or a cloud metadata endpoint. And the text that comes back is handed to
the model explicitly labelled as untrusted content, because a page can try to
issue instructions to an assistant that holds tools. Mairo is told to report
what a page says and never to act on it.

To point it at something on your own machine anyway, set
`MAIRO_ALLOW_LOCAL_FETCH=1` in `.env`.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+M` | Start or stop listening |
| `Ctrl+N` | New conversation |
| `Ctrl+H` | Show or hide the history panel |
| `Ctrl+,` | Settings |
| `Ctrl+Shift+S` | Speak replies aloud, or stop speaking them |
| `Esc` | Stop listening or speaking |

## Settings

**Intelligence** — the model (blank uses `OPENAI_MODEL` from `.env`), how many
recent messages to send as context, request timeout.

**Voice** — speak replies on or off, voice engine, voice, speaking speed,
speech recognition engine, microphone, maximum recording length, wake word and
its phrase.

**Application** — theme (Nebula, Aurora, Ember, Monochrome), whether to save
conversation history, start with Windows.

Settings are saved immediately and survive restarts.

### Voice engines

| Engine | Cost | Needs internet | Quality |
|---|---|---|---|
| System voice (default) | free | no | good — Windows SAPI5, or macOS `say` |
| OpenAI voice | per request | yes | noticeably better |

Speech recognition defaults to OpenAI (accurate, uses your key). The Google web
endpoint is available as a no-key fallback.

### Wake word

Mairo can listen for a spoken phrase instead of a button press. Detection runs
**offline** through Picovoice Porcupine — the audio is processed on your
computer and never leaves it.

It is off by default and takes two things to switch on:

```bat
pip install pvporcupine
```

then a free access key from [console.picovoice.ai](https://console.picovoice.ai),
put in `.env`:

```
PICOVOICE_ACCESS_KEY=your-key-here
```

Turn it on under Settings › Voice. Porcupine ships a set of ready-made words
but "Hey Mairo" is not one of them, so out of the box it listens for the
built-in word **computer**. To use "Hey Mairo", train a keyword file free on
the same console and point `.env` at it:

```
PICOVOICE_KEYWORD_FILE=C:\path\to\hey-mairo.ppn
```

Until both the package and the key are present, **nothing listens in the
background** — the detector is a placeholder that never opens the microphone,
so turning the setting on cannot record you by accident. The Settings screen
and the Assistant panel both say which state you are in.

While Mairo is answering, the wake word stops listening and hands the
microphone to the conversation, then resumes when the turn ends.

To add a different engine, subclass `WakeWordDetector` in
`app/voice/wake_word.py` and return it from `create_detector`. Nothing above
that file needs to change.

## Making a standalone Mairo.exe

If you would rather not keep a Python environment around, build Mairo into a
folder you can copy anywhere and start with a double-click:

```bat
build_windows.bat
```

That installs PyInstaller, builds with `mairo.spec`, and puts your `.env` next
to the executable. The result is `dist\Mairo\Mairo.exe`; the whole `dist\Mairo`
folder is what you copy or shortcut to. It needs no Python installed.

The build takes a few minutes and the folder is large (a few hundred megabytes
— most of it is Qt). Your key lives in `dist\Mairo\.env`, so keep that folder
to yourself.

PyInstaller does not cross-compile: a Windows executable has to be built on
Windows. The same spec builds a macOS or Linux binary on those systems.

## Where your data lives

Everything is under `%APPDATA%\Mairo`:

```
mairo.db          conversations, memories, notes
settings.json     your settings
logs\mairo.log    rotating debug log, with keys and tokens redacted
notes\            notes also written as plain text, one file per day
screenshots\      screen captures
```

Set `MAIRO_HOME` in `.env` to put it somewhere else. Delete the folder to reset
Mairo completely.

## Project structure

```
desktop/
  main.py                 entry point: wires everything together
  requirements.txt
  .env.example
  run_mairo.bat           start Mairo on Windows (double-click)
  run_mairo.command       start Mairo on macOS (double-click)
  build_windows.bat       build a standalone Mairo.exe
  mairo.spec              PyInstaller recipe
  app/
    config/               settings, paths, the system persona
    ai/                   provider interface, OpenAI provider, brain, history
    voice/                recorder, speech-to-text, text-to-speech, wake word
    tools/                one file per family of computer actions
    memory/               long-term preferences
    database/             SQLite schema and access
    ui/                   window, orb, starfield, waveform, gauges, panels, dialogs
    utils/                logging, errors, platform, audio and machine readings
  tests/                  unit, interface and provider tests
```

### Adding a tool

Tools are the extension point. Write a class, register it, done:

```python
# app/tools/timer.py
from app.tools.base import Tool, ToolResult

class StartTimerTool(Tool):
    name = "start_timer"
    description = "Start a countdown timer for a number of minutes."
    parameters = {
        "type": "object",
        "properties": {"minutes": {"type": "integer"}},
        "required": ["minutes"],
    }
    requires_confirmation = False   # True for anything risky or private

    def run(self, args):
        minutes = int(args.get("minutes", 0))
        if minutes <= 0:
            return ToolResult.failure("A timer needs a length in minutes.")
        return ToolResult.success(f"Timer set for {minutes} minutes.")
```

Then add `timer.StartTimerTool` to the list in
`app/tools/registry.py::build_default_registry`. The description is the only
instruction the model gets, so write it the way you would brief a person.

### Swapping a voice or model provider

Speech providers implement `SpeechToText` or `TextToSpeech` in
`app/voice/base.py` and are registered in the two dictionaries at the top of
`app/voice/manager.py`. A different language model means one more
`LLMProvider` subclass (`app/ai/base.py`); nothing above that layer knows which
service answered.

### Built to grow into

The seams for Gmail, Calendar, weather, smart home, market data, screen vision,
computer automation, plugins, accounts and multiple users are all the tool
registry plus the provider interfaces. Long-term memory has its own store
already, kept separate from conversation history so one can grow without
touching the other.

## When something goes wrong

Mairo shows problems in the transcript instead of closing. The log at
`%APPDATA%\Mairo\logs\mairo.log` has the detail, with anything resembling a key
or token replaced by `[redacted]`.

| Symptom | Fix |
|---|---|
| "No OpenAI API key found" | `.env` is missing or empty. Copy `.env.example` to `.env`, add the key, restart. |
| "The OpenAI API key was rejected" | The key is wrong or revoked. Make a new one. |
| "The model … is not available" | Change `OPENAI_MODEL`, or pick another model in Settings. |
| "Mairo could not reach the OpenAI service" | No internet, or a firewall is blocking it. |
| "rate limit or has no remaining quota" | Check billing at platform.openai.com. |
| "No microphone was detected" | Plug one in, then reopen Settings. Typing still works. |
| "The microphone could not be opened" | Windows Settings › Privacy & security › Microphone, allow desktop apps. |
| "Nothing was heard" | Speak a little louder or closer, then try again. |
| "No system speech voice could be started" | Add a voice under Windows Settings › Time & language › Speech, or switch to the OpenAI voice. |
| Wake word does nothing | It needs `pip install pvporcupine` and `PICOVOICE_ACCESS_KEY` in `.env`. The Assistant panel says which is missing. |
| An app will not open | Tell Mairo the full path once: "remember that Spotify is at C:\…\Spotify.exe". |
| `pip install` fails on PySide6 | Use 64-bit Python 3.10–3.13 and upgrade pip: `python -m pip install --upgrade pip`. |

## Tests

```bat
.venv\Scripts\activate
pip install pytest
python -m pytest tests -q
```

157 tests cover memory, conversation history, the tool registry, the reasoning
loop with its confirmation gate, settings, log redaction, the OpenAI wire
format against a local stand-in server, and the window itself driven
end-to-end without a display.

## What Mairo will not do

No credential theft, no bypassing permissions, no disabling security software,
no recording anyone without their knowledge, no reaching into accounts that are
not yours. Anything irreversible, disruptive or private asks first, every time.
