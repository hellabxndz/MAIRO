# PyInstaller build recipe for Mairo.
#
# Build on the machine you want to run on — PyInstaller does not cross-compile,
# so a Windows .exe has to be built on Windows:
#
#     .venv\Scripts\activate
#     pip install pyinstaller
#     pyinstaller mairo.spec
#
# The result is dist\Mairo\Mairo.exe, a folder you can copy anywhere. It needs
# no Python installed. Put your .env next to Mairo.exe.

import sys
from pathlib import Path

block_cipher = None
project = Path(SPECPATH)

# Imported lazily or through Qt, so PyInstaller cannot see them by itself.
hidden = [
    "pyttsx3.drivers",
    "pyttsx3.drivers.dummy",
    "sounddevice",
    "soundfile",
    "mss",
    "pyperclip",
    "psutil",
    "speech_recognition",
]
if sys.platform == "win32":
    hidden += [
        "pyttsx3.drivers.sapi5",
        "win32com",
        "win32com.client",
        "pythoncom",
        "pywintypes",
        "comtypes",
        "pycaw",
        "pycaw.pycaw",
    ]
elif sys.platform == "darwin":
    hidden += ["pyttsx3.drivers.nsss"]
else:
    hidden += ["pyttsx3.drivers.espeak"]

analysis = Analysis(
    ["main.py"],
    pathex=[str(project)],
    binaries=[],
    datas=[(".env.example", ".")],
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    # Qt modules Mairo never touches; leaving them out roughly halves the build.
    excludes=[
        "PySide6.QtWebEngineCore",
        "PySide6.QtWebEngineWidgets",
        "PySide6.Qt3DCore",
        "PySide6.QtQuick",
        "PySide6.QtQml",
        "PySide6.QtMultimedia",
        "PySide6.QtCharts",
        "PySide6.QtDataVisualization",
        "tkinter",
        "matplotlib",
        "pytest",
    ],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(analysis.pure, analysis.zipped_data, cipher=block_cipher)

executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="Mairo",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # No console window: Mairo reports its problems in its own interface, and
    # the details go to the log file.
    console=False,
    disable_windowed_traceback=False,
    icon=str(project / "assets" / "mairo.ico")
    if (project / "assets" / "mairo.ico").exists()
    else None,
)

collection = COLLECT(
    executable,
    analysis.binaries,
    analysis.zipfiles,
    analysis.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Mairo",
)
