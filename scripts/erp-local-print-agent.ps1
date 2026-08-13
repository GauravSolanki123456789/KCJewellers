# KC ERP — local Windows USB label print agent (PowerShell).
# No Node.js or Python required. Double-click start-erp-print-agent.bat on the shop PC.
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

function Invoke-RawPrint([string]$PrinterName, [string]$Tspl) {
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $tmp = Join-Path $env:TEMP "kc-erp-label-$(Get-Date -Format 'yyyyMMddHHmmss')-$suffix.prn"
    [System.IO.File]::WriteAllText($tmp, [string]$Tspl, [System.Text.Encoding]::UTF8)
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RawPrintPs1 -PrinterName $PrinterName -FilePath $tmp
        if ($LASTEXITCODE -ne 0) {
            throw "Raw print failed for printer: $PrinterName"
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
            $list = @()
            if ($payload.tsplList) {
                $list = @($payload.tsplList)
            } elseif ($payload.tspl) {
                $list = @([string]$payload.tspl)
            }
            if ($list.Count -eq 0) {
                Send-JsonResponse $Context 400 @{ ok = $false; error = 'No TSPL data' }
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
Write-Host ' Printer name: TSC TTP-244 Pro (change in ERP Hardware if needed).'
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
