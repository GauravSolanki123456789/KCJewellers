@echo off
REM Launcher from project scripts folder — prefer copying erp-print-service folder to Desktop.
if exist "%~dp0erp-print-service\START-KC-Label-Print.bat" (
  call "%~dp0erp-print-service\START-KC-Label-Print.bat"
  exit /b %ERRORLEVEL%
)
call "%~dp0start-erp-print-agent.bat"
