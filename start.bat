@echo off
title XP Flight Computer
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (where python >nul 2>nul && set "PY=python")
if not defined PY goto nopython
%PY% xpfc.py %*
if errorlevel 1 pause
exit /b

:nopython
echo.
echo   Python 3 was not found.
echo   Install it from https://www.python.org/downloads/  (tick "Add python.exe to PATH"),
echo   or build a stand-alone XP-FlightComputer.exe on a PC that has Python (build_exe.bat).
echo.
pause
