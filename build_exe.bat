@echo off
title Build XP-FlightComputer.exe
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (where python >nul 2>nul && set "PY=python")
if not defined PY (echo Python 3 was not found. & pause & exit /b 1)
%PY% -m pip install --upgrade pyinstaller
if errorlevel 1 (echo Could not install PyInstaller. & pause & exit /b 1)
%PY% -m PyInstaller --noconfirm --onefile --console --name XP-FlightComputer --add-data "web;web" xpfc.py
if errorlevel 1 (echo Build failed. & pause & exit /b 1)
copy /y user_profiles.example.json dist\ >nul
echo.
echo   Done: dist\XP-FlightComputer.exe  (double-click it; keep user_profiles.json next to it)
echo.
pause
