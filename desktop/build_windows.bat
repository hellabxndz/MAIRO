@echo off
REM Build Mairo into a standalone folder you can run without Python.
REM Produces dist\Mairo\Mairo.exe
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Set the project up first:
    echo     python -m venv .venv
    echo     .venv\Scripts\activate
    echo     pip install -r requirements.txt
    pause
    exit /b 1
)

echo Installing PyInstaller...
".venv\Scripts\python.exe" -m pip install --quiet pyinstaller || goto :failed

echo Building. This takes a few minutes the first time...
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean mairo.spec || goto :failed

if not exist "dist\Mairo\.env" (
    if exist ".env" (
        copy ".env" "dist\Mairo\.env" >nul
        echo Copied your .env next to the executable.
    ) else (
        copy ".env.example" "dist\Mairo\.env" >nul
        echo No .env found. Copied .env.example - add your API key to dist\Mairo\.env
    )
)

echo.
echo Done. Run dist\Mairo\Mairo.exe
pause
exit /b 0

:failed
echo.
echo The build failed. The output above says why.
pause
exit /b 1
