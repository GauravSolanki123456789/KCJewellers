@echo off
title KC ERP Label Print Service
cd /d "%~dp0"

if not exist "%~dp0erp-local-print-agent.ps1" (
  echo.
  echo ERROR: Missing erp-local-print-agent.ps1 in this folder.
  echo.
  echo Copy the ENTIRE folder "erp-print-service" to Desktop — not just this .bat file.
  echo It must contain 3 files:
  echo   START-KC-Label-Print.bat
  echo   erp-local-print-agent.ps1
  echo   windows-raw-print.ps1
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  KC ERP Label Print Service (USB001)
echo ========================================
echo  No Node.js or Python needed.
echo  Keep this window OPEN while printing.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0erp-local-print-agent.ps1"
echo.
echo Print service stopped.
pause
