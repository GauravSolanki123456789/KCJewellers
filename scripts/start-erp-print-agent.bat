@echo off
title KC ERP Label Print Agent
cd /d "%~dp0.."
echo Starting KC ERP local print agent for TSC USB printer (USB001)...
node scripts/erp-local-print-agent.js
pause
