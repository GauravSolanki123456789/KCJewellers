@echo off
title KC ERP Label Print Service
cd /d "%~dp0"

if exist "%~dp0erp-print-service\START-KC-Label-Print.bat" (
  call "%~dp0erp-print-service\START-KC-Label-Print.bat"
  exit /b %ERRORLEVEL%
)

if not exist "%~dp0erp-local-print-agent.ps1" (
  echo.
  echo ERROR: Print service files not found.
  echo Copy the folder scripts\erp-print-service to Desktop and run START-KC-Label-Print.bat
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  KC ERP Label Print Service (USB001)
echo ========================================
echo  No Node.js or Python needed.
echo  Keep this window open while printing.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0erp-local-print-agent.ps1"
if %ERRORLEVEL% EQU 0 goto :end

echo.
echo Trying Python / Node fallbacks...
python "%~dp0erp-local-print-agent.py" 2>nul
if %ERRORLEVEL% EQU 0 goto :end
py -3 "%~dp0erp-local-print-agent.py" 2>nul
if %ERRORLEVEL% EQU 0 goto :end
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 node "%~dp0erp-local-print-agent.js"

:end
pause
