@echo off
REM Start Mairo using the virtual environment in this folder.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo The virtual environment is missing. Run these first:
    echo     python -m venv .venv
    echo     .venv\Scripts\activate
    echo     pip install -r requirements.txt
    pause
    exit /b 1
)
".venv\Scripts\pythonw.exe" main.py
