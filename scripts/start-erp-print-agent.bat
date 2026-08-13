@echo off
title KC ERP Label Print Service
cd /d "%~dp0.."

echo.
echo ========================================
echo  KC ERP Label Print Service (USB001)
echo ========================================
echo  Node.js is NOT required on this PC.
echo  Keep this window open while printing.
echo.

REM 1) PowerShell agent — works on every Windows 10/11 PC
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0erp-local-print-agent.ps1"
if %ERRORLEVEL% EQU 0 goto :end

echo.
echo PowerShell agent stopped or failed. Trying Python...
python "%~dp0erp-local-print-agent.py" 2>nul
if %ERRORLEVEL% EQU 0 goto :end

py -3 "%~dp0erp-local-print-agent.py" 2>nul
if %ERRORLEVEL% EQU 0 goto :end

echo.
echo Trying Node.js agent...
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  node "%~dp0erp-local-print-agent.js"
  goto :end
)

echo.
echo ERROR: Could not start the print service.
echo.
echo Fix: Right-click this file and choose "Run as administrator" once.
echo Or contact support — PowerShell should already be on your PC.
echo.
pause

:end
