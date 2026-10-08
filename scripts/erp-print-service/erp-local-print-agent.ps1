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

function Resolve-ZebraPrinterName([string]$Requested) {
    $names = Get-InstalledPrinterNames
    if ($names -contains $Requested) { return $Requested }
    foreach ($n in $names) {
        if ($n -match 'Zebra|ZDesigner|GC420|EPL|ZPL') { return $n }
    }
    return $Requested
}

function Resolve-LabelPrinterName([string]$Requested) {
    $names = Get-InstalledPrinterNames
    if ($names -contains $Requested) { return $Requested }
    if ($Requested -match 'Zebra|ZDesigner|GC420|EPL|ZPL') {
        return Resolve-ZebraPrinterName $Requested
    }
    return Resolve-TscPrinterName $Requested
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

function Normalize-TallyUrl([string]$Raw) {
    $s = [string]$Raw
    if (-not $s.Trim()) { $s = 'http://localhost:9000' }
    if ($s -notmatch '^https?://') { $s = "http://$s" }
    try {
        $u = [Uri]$s
        if (-not $u.Port -or $u.Port -le 0) {
            $port = if ($u.Scheme -eq 'https') { 443 } else { 9000 }
            $builder = New-Object System.UriBuilder $u
            $builder.Port = $port
            $u = $builder.Uri
        }
        return $u.ToString().TrimEnd('/')
    } catch {
        return 'http://localhost:9000'
    }
}

function Test-TallyImportResponse([string]$XmlResponse) {
    $raw = [string]$XmlResponse
    if (-not $raw.Trim()) {
        throw 'Empty response from Tally'
    }
    if ($raw -match '<LINEERROR>([^<]*)</LINEERROR>') {
        $msg = $Matches[1].Trim()
        if ($msg) { throw $msg }
        throw 'Tally line error'
    }
    if ($raw -match '<ERRMSG[^>]*>([^<]*)</ERRMSG>') {
        $msg = $Matches[1].Trim()
        if ($msg) { throw $msg }
    }
    if ($raw -match '<ERRORS>(\d+)</ERRORS>') {
        if ([int]$Matches[1] -gt 0) { throw 'Tally reported import errors' }
    }
    if ($raw -match '<CREATED>(\d+)</CREATED>') {
        $c = [int]$Matches[1]
        if ($c -gt 0) { return }
    }
    if ($raw -match '<ALTERED>(\d+)</ALTERED>') {
        $a = [int]$Matches[1]
        if ($a -gt 0) { return }
    }
    if ($raw -match 'Unknown Request|Could not find') {
        throw ($raw.Substring(0, [Math]::Min(200, $raw.Length)))
    }
    if ($raw -match '<RESPONSE>') {
        throw 'Tally did not create voucher (check company name and ledgers)'
    }
}

function Build-TallyLedgerXml([string]$CompanyName, [string]$LedgerName, [string]$ParentGroup) {
    $c = [System.Security.SecurityElement]::Escape([string]$CompanyName)
    $l = [System.Security.SecurityElement]::Escape([string]$LedgerName)
    $p = [System.Security.SecurityElement]::Escape([string]$ParentGroup)
    return @"
<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>$c</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="$l" ACTION="Create">
            <PARENT>$p</PARENT>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
"@
}

function Resolve-TallyLedgerParent([string]$LedgerName, $LedgerCfg) {
    if (-not $LedgerCfg) { return $null }
    $n = [string]$LedgerName
    $sales = [string]$LedgerCfg.salesLedger
    $purchase = [string]$LedgerCfg.purchaseLedger
    $cash = [string]$LedgerCfg.cashLedger
    $bank = [string]$LedgerCfg.bankLedger
    if ($sales -and $n -eq $sales) { return 'Sales Accounts' }
    if ($purchase -and $n -eq $purchase) { return 'Purchase Accounts' }
    if ($cash -and $n -eq $cash) { return 'Cash-in-Hand' }
    if ($bank -and $n -eq $bank) { return 'Bank Accounts' }
    if ($n -match '^Sales') { return 'Sales Accounts' }
    if ($n -match '^Purchase') { return 'Purchase Accounts' }
    if ($n -match 'Cash') { return 'Cash-in-Hand' }
    if ($n -match 'Bank') { return 'Bank Accounts' }
    return $null
}

function Invoke-TallyImport([string]$TallyUrl, [string]$Xml, $LedgerCfg) {
    $url = Normalize-TallyUrl $TallyUrl
    $uri = [Uri]$url
    $path = if ($uri.AbsolutePath -and $uri.AbsolutePath -ne '/') { $uri.AbsolutePath } else { '/' }
    $req = [System.Net.HttpWebRequest]::Create("$($uri.Scheme)://$($uri.Host):$($uri.Port)$path")
    $req.Method = 'POST'
    $req.ContentType = 'text/xml; charset=utf-8'
    $req.Timeout = 45000
    $bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$Xml)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader $resp.GetResponseStream()
    $body = $reader.ReadToEnd()
    $reader.Close()
    $resp.Close()
    try {
        Test-TallyImportResponse $body
    } catch {
        $err = $_.Exception.Message
        if ($err -match "Ledger ['`"]([^'`"]+)['`"] does not exist") {
            $missing = $Matches[1]
            $parent = Resolve-TallyLedgerParent $missing $LedgerCfg
            $company = [string]$LedgerCfg.companyName
            if ($parent -and $company.Trim()) {
                $master = Build-TallyLedgerXml $company $missing $parent
                Invoke-TallyImport $TallyUrl $master $null
                Invoke-TallyImport $TallyUrl $Xml $LedgerCfg
                return
            }
        }
        throw
    }
}

function Invoke-RawPrint([string]$PrinterName, [string]$Tspl) {
    $resolved = Resolve-LabelPrinterName $PrinterName
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $tmp = Join-Path $env:TEMP "kc-erp-label-$(Get-Date -Format 'yyyyMMddHHmmss')-$suffix.prn"
    # No UTF-8 BOM — Zebra/TSC raw jobs fail silently if the stream starts with EF BB BF.
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmp, [string]$Tspl, $utf8NoBom)
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
        Send-JsonResponse $Context 200 @{
            ok = $true
            service = 'kc-erp-local-print'
            port = $Port
            runtime = 'powershell'
            supportsReceipt = $true
            supportsLabels = $true
            supportsTally = $true
        }
        return
    }

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/tally-import') {
        try {
            $body = Read-RequestBody $request
            $payload = @{}
            if ($body) { $payload = $body | ConvertFrom-Json }
            $tallyUrl = Normalize-TallyUrl ([string]($payload.tallyUrl))
            $xml = [string]($payload.xml)
            if (-not $xml.Trim()) {
                Send-JsonResponse $Context 400 @{ ok = $false; error = 'No Tally XML' }
                return
            }
            $ledgerCfg = $payload.ledgerCfg
            Invoke-TallyImport $tallyUrl $xml $ledgerCfg
            Send-JsonResponse $Context 200 @{ ok = $true }
        } catch {
            Send-JsonResponse $Context 500 @{ ok = $false; error = $_.Exception.Message; tallyError = $_.Exception.Message }
        }
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

    if ($request.HttpMethod -eq 'POST' -and $path -eq '/print-receipt') {
        try {
            $body = Read-RequestBody $request
            $payload = @{}
            if ($body) {
                $payload = $body | ConvertFrom-Json
            }
            $printerName = [string]($payload.printerName)
            if (-not $printerName.Trim()) { $printerName = 'EPSON TM-m30III Receipt' }
            if (-not $payload.escPosBase64) {
                Send-JsonResponse $Context 400 @{ ok = $false; error = 'No receipt data' }
                return
            }
            Invoke-RawPrintBinary $printerName ([string]$payload.escPosBase64)
            Send-JsonResponse $Context 200 @{ ok = $true; count = 1; printerName = $printerName; kind = 'receipt' }
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
Write-Host ' KC ERP Print Service'
Write-Host '========================================'
Write-Host " Listening on $Prefix"
Write-Host ' Keep this window OPEN while printing from Chrome.'
Write-Host ' Labels: TSC / Zebra GC420t · Receipts: EPSON TM-m30III Receipt · Tally export'
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
