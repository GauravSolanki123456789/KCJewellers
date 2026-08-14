@echo off
title KC ERP — Check TSC Printer
cd /d "%~dp0"

echo.
echo ========================================
echo  TSC Printer Diagnostic
echo ========================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$printers = @(Get-Printer -ErrorAction SilentlyContinue); ^
   Write-Host 'Installed Windows printers:'; ^
   if (-not $printers.Count) { Write-Host '  (NONE — this is the problem!)' -ForegroundColor Red } ^
   else { $printers | ForEach-Object { Write-Host ('  - ' + $_.Name + '  port: ' + ($_.PortName)) } }; ^
   Write-Host ''; ^
   $tsc = $printers | Where-Object { $_.Name -match 'TSC|TTP.?244|TSCTTP|Barcode' }; ^
   if ($tsc) { Write-Host 'TSC printer found:' $tsc.Name -ForegroundColor Green; Write-Host 'Use this EXACT name in ERP Hardware settings.' -ForegroundColor Green } ^
   else { Write-Host 'NO TSC printer installed in Windows.' -ForegroundColor Red; Write-Host 'USB001 in Print to PDF ports does NOT count.' -ForegroundColor Yellow; Write-Host 'You must install the TSC TTP-244 driver from tscprinters.com' -ForegroundColor Yellow }; ^
   Write-Host ''; ^
   Write-Host 'USB devices (Device Manager style):'; ^
   Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'TSC|TTP|244|USB Printing' } | ForEach-Object { Write-Host ('  - ' + $_.FriendlyName + '  [' + $_.Status + ']') }"

echo.
echo If NO TSC printer listed above:
echo   1. Power ON the TSC printer (green PWR light)
echo   2. Plug USB directly into PC (try another USB port)
echo   3. Download TSC TTP-244 driver from tscprinters.com
echo   4. Install driver — printer must appear in Settings ^> Printers
echo   5. Open that TSC printer ^> Ports ^> check USB001
echo   6. Put exact printer name in ERP Hardware
echo.
pause
