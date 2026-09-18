#!/bin/bash
# Double-click this file in Finder to start Mairo.
#
# macOS runs .command files in Terminal, so this needs no setup beyond the
# one-time install. Keep the Terminal window it opens: closing it quits Mairo.

cd "$(dirname "$0")" || exit 1

if [ ! -x ".venv/bin/python" ]; then
    echo "Mairo is not set up yet. In this folder, run:"
    echo
    echo "    python3 -m venv .venv"
    echo "    source .venv/bin/activate"
    echo "    pip install -r requirements.txt"
    echo
    read -n 1 -s -r -p "Press any key to close this window."
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "No .env file found, so Mairo has no API key."
    echo "Copy .env.example to .env and add your OPENAI_API_KEY, then try again."
    echo
    read -n 1 -s -r -p "Press any key to close this window."
    exit 1
fi

exec .venv/bin/python main.py
