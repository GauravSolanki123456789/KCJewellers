# KC ERP — local Windows USB label print agent (PowerShell).
# Portable copy for shop PC Desktop — no Node.js or Python required.
param(
    [int]$Port = 17888
)

$ErrorActionPreference = 'Stop'
$HostAddr = '127.0.0.1'
$Prefix = "http://${HostAddr}:$Port/"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RawPrintPs1 = Join-Path $ScriptDir 'windows-raw-print.ps1'

function Write-CorsHeaders($Response) {
    $Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
}

function Send-JsonResponse($Context, [int]$StatusCode, $Object) {
    $json = $Object | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response = $Context.Response
    Write-CorsHeaders $response
    $response.StatusCode = $StatusCode
    $response.ContentType = 'application/json; charset=utf-8'
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

function Read-RequestBody($Request) {
    if (-not $Request.HasEntityBody) { return '' }
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    try {
        return $reader.ReadToEnd()
    } finally {
        $reader.Close()
    }
}

function Get-InstalledPrinterNames {
    try {
        return @(Get-Printer | Select-Object -ExpandProperty Name)
    } catch {
        return @()
    }
}

function Resolve-TscPrinterName([string]$Requested) {
    $names = Get-InstalledPrinterNames
    if ($names -contains $Requested) { return $Requested }
    foreach ($n in $names) {
        if ($n -match 'TSC|TTP.?244|TSCTTP|Barcode|TTP-244') { return $n }
    }
    return $Requested
}

function Invoke-RawPrintBinary([string]$PrinterName, [string]$EscPosBase64) {
    $resolved = Resolve-TscPrinterName $PrinterName
    if ($PrinterName -match 'EPSON|TM-m|TM-T|Receipt|Billing') {
        $names = Get-InstalledPrinterNames
        if ($names -contains $PrinterName) { $resolved = $PrinterName }
        else {
            foreach ($n in $names) {
                if ($n -match 'EPSON|TM-m|TM-T|Receipt|Billing') { $resolved = $n; break }
            }
        }
    }
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $tmp = Join-Path $env:TEMP "kc-erp-receipt-$(Get-Date -Format 'yyyyMMddHHmmss')-$suffix.bin"
    $bytes = [Convert]::FromBase64String([string]$EscPosBase64)
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RawPrintPs1`" -PrinterName `"$resolved`" -FilePath `"$tmp`""
        $psi.RedirectStandardError = $true
        $psi.RedirectStandardOutput = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        $stderr = $p.StandardError.ReadToEnd()
        $stdout = $p.StandardOutput.ReadToEnd()
        $p.WaitForExit()
        if ($p.ExitCode -ne 0) {
            $installed = Get-InstalledPrinterNames
            $list = if ($installed.Count) { ($installed -join ', ') } else { 'none' }
            $detail = if ($stderr.Trim()) { $stderr.Trim() } else { "Exit code $($p.ExitCode)" }
            throw "Receipt print failed ($resolved). Installed printers: $list. $detail"
        }
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-RawPrint([string]$PrinterName, [string]$Tspl) {
    $resolved = Resolve-TscPrinterName $PrinterName
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $tmp = Join-Path $env:TEMP "kc-erp-label-$(Get-Date -Format 'yyyyMMddHHmmss')-$suffix.prn"
    [System.IO.File]::WriteAllText($tmp, [string]$Tspl, [System.Text.Encoding]::UTF8)
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RawPrintPs1`" -PrinterName `"$resolved`" -FilePath `"$tmp`""
        $psi.RedirectStandardError = $true
        $psi.RedirectStandardOutput = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        $stderr = $p.StandardError.ReadToEnd()
        $stdout = $p.StandardOutput.ReadToEnd()
        $p.WaitForExit()
        if ($p.ExitCode -ne 0) {
            $installed = Get-InstalledPrinterNames
            $list = if ($installed.Count) { ($installed -join ', ') } else { 'none' }
            $detail = if ($stderr.Trim()) { $stderr.Trim() } else { "Exit code $($p.ExitCode)" }
            throw "Print failed ($resolved). Installed printers: $list. $detail"
        }
        if ($resolved -ne $PrinterName -and $stdout.Trim()) {
            Write-Host $stdout.Trim()
        }
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Handle-Request($Context) {
    $request = $Context.Request
    $path = $request.Url.AbsolutePath.TrimEnd('/')
    if (-not $path) { $path = '/' }

    if ($request.HttpMethod -eq 'OPTIONS') {
        $response = $Context.Response
        Write-CorsHeaders $response
        $response.StatusCode = 204
        $response.Close()
        return
    }

    if ($request.HttpMethod -eq 'GET' -and $path -eq '/health') {
        Send-JsonResponse $Context 200 @{ ok = $true; service = 'kc-erp-local-print'; port = $Port; runtime = 'powershell' }
        return
    }

    if ($request.HttpMethod -eq 'GET' -and $path -eq '/printers') {
        try {
            $names = @(Get-Printer | Select-Object -ExpandProperty Name)
            Send-JsonResponse $Context 200 @{ ok = $true; printers = $names }
        } catch {
            Send-JsonResponse $Context 500 @{ ok = $false; error = $_.Exception.Message }
        }
        return
    }

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/print') {
        try {
            $body = Read-RequestBody $request
            $payload = @{}
            if ($body) {
                $payload = $body | ConvertFrom-Json
            }
            $printerName = [string]($payload.printerName)
            if (-not $printerName.Trim()) { $printerName = 'TSC TTP-244 Pro' }
            if ($payload.escPosBase64) {
                Invoke-RawPrintBinary $printerName ([string]$payload.escPosBase64)
                Send-JsonResponse $Context 200 @{ ok = $true; count = 1; printerName = $printerName; kind = 'receipt' }
                return
            }
            $list = @()
            if ($payload.tsplList) {
                $list = @($payload.tsplList)
            } elseif ($payload.tspl) {
                $list = @([string]$payload.tspl)
            }
            if ($list.Count -eq 0) {
                Send-JsonResponse $Context 400 @{ ok = $false; error = 'No TSPL or receipt data' }
                return
            }
            foreach ($item in $list) {
                Invoke-RawPrint $printerName $item
                Start-Sleep -Milliseconds 450
            }
            Send-JsonResponse $Context 200 @{ ok = $true; count = $list.Count; printerName = $printerName }
        } catch {
            Send-JsonResponse $Context 500 @{ ok = $false; error = $_.Exception.Message }
        }
        return
    }

    Send-JsonResponse $Context 404 @{ ok = $false; error = 'Not found' }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)
$listener.Start()

Write-Host ''
Write-Host '========================================'
Write-Host ' KC ERP Label Print Service (USB001)'
Write-Host '========================================'
Write-Host " Listening on $Prefix"
Write-Host ' Keep this window OPEN while printing from Chrome.'
Write-Host ' Printer name: TSC TTP-244 Pro (must match Windows Printers list exactly).'
Write-Host ' Run CHECK-TSC-Printer.bat if labels fail.'
Write-Host ' Press Ctrl+C to stop.'
Write-Host ''

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            Handle-Request $context
        } catch {
            try {
                Send-JsonResponse $context 500 @{ ok = $false; error = $_.Exception.Message }
            } catch {
                $context.Response.Close()
            }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
