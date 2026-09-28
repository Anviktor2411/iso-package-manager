@echo off
title XP Flight Computer - allow phones and tablets
rem Lets phones and tablets on your home network open XP Flight Computer (TCP port 8765).
rem Adds a Windows Firewall rule for the local network only, and switches off the "block" rules
rem Windows creates for Python when its firewall prompt is cancelled. The button in the app
rem (Settings, Phone ^& tablet, "Fix the Windows Firewall") does the same thing.
net session >nul 2>&1
if errorlevel 1 (
  echo Asking Windows for permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName 'XP Flight Computer' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'XP Flight Computer' -Description 'Lets phones and tablets on your local network open XP Flight Computer.' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8765 -RemoteAddress LocalSubnet -Profile Any | Out-Null; $n = 0; foreach ($r in @(Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True -ErrorAction SilentlyContinue)) { $p = [string]($r | Get-NetFirewallApplicationFilter).Program; if ($p -match '\\(python|pythonw|XP-FlightComputer)\.exe$') { Disable-NetFirewallRule -Name $r.Name; $n++ } }; Write-Host ('Firewall rule added for TCP port 8765. Blocking rules for Python switched off: ' + $n)"
echo.
echo Done. On your phone, open the address shown in the app under Settings, Phone ^& tablet.
echo If Windows asks about Python later, click "Allow access".
echo.
pause
