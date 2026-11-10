# KC ERP — send a PDF file to a named Windows printer (invoices, quotation PDFs).
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string]$Paper = 'A4'
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "PDF not found: $FilePath"
}

$names = @()
try { $names = @(Get-Printer | Select-Object -ExpandProperty Name) } catch { $names = @() }
$resolved = $PrinterName.Trim()
if ($names -notcontains $resolved) {
    foreach ($n in $names) {
        if ($n -eq $PrinterName) { $resolved = $n; break }
    }
    if ($names -notcontains $resolved) {
        foreach ($n in $names) {
            if ($n -match 'L3250|L-3250|L3310|L-3310|EcoTank|L3210|L3110') { $resolved = $n; break }
        }
    }
    if ($names -notcontains $resolved) {
        foreach ($n in $names) {
            if ($n -match 'EPSON|Epson') { $resolved = $n; break }
        }
    }
}

function Get-SumatraPath {
    $candidates = @(
        (Join-Path $ScriptDir 'SumatraPDF.exe'),
        (Join-Path $ScriptDir 'SumatraPDF-64.exe'),
        "${env:ProgramFiles}\SumatraPDF\SumatraPDF.exe",
        "${env:ProgramFiles(x86)}\SumatraPDF\SumatraPDF.exe",
        (Join-Path ${env:LocalAppData} 'SumatraPDF\SumatraPDF.exe')
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) { return $c }
    }
    return $null
}

function Get-AcrobatPath {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
        "${env:ProgramFiles}\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
        "${env:ProgramFiles(x86)}\Adobe\Acrobat DC\Acrobat\Acrobat.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }
    return $null
}

function Invoke-SumatraPrint([string]$Exe, [string]$Printer, [string]$Pdf) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = "-print-to `"$Printer`" -silent `"$Pdf`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $null = $p.WaitForExit(120000)
    if (-not $p.HasExited) {
        try { $p.Kill() } catch { }
        throw 'SumatraPDF print timed out.'
    }
    if ($p.ExitCode -ne 0) {
        throw "SumatraPDF exit code $($p.ExitCode)"
    }
}

function Invoke-AcrobatPrint([string]$Exe, [string]$Printer, [string]$Pdf) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = "/t `"$Pdf`" `"$Printer`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $null = $p.WaitForExit(120000)
    if (-not $p.HasExited) {
        try { $p.Kill() } catch { }
        throw 'Acrobat print timed out.'
    }
}

function Invoke-ShellPrintTo([string]$Printer, [string]$Pdf) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Pdf
    $psi.Verb = 'PrintTo'
    $psi.Arguments = "`"$Printer`""
    $psi.UseShellExecute = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $p = [System.Diagnostics.Process]::Start($psi)
    if ($p) {
        $null = $p.WaitForExit(120000)
    } else {
        Start-Sleep -Seconds 4
    }
}

$printed = $false
$lastErr = ''

$sumatra = Get-SumatraPath
if ($sumatra) {
    try {
        Invoke-SumatraPrint $sumatra $resolved $FilePath
        $printed = $true
    } catch {
        $lastErr = $_.Exception.Message
    }
}

if (-not $printed) {
    $acro = Get-AcrobatPath
    if ($acro) {
        try {
            Invoke-AcrobatPrint $acro $resolved $FilePath
            $printed = $true
        } catch {
            $lastErr = $_.Exception.Message
        }
    }
}

if (-not $printed) {
    try {
        Invoke-ShellPrintTo $resolved $FilePath
        $printed = $true
    } catch {
        $lastErr = $_.Exception.Message
    }
}

if (-not $printed) {
    $list = if ($names.Count) { ($names -join ', ') } else { 'none' }
    throw "PDF print failed ($resolved). Install SumatraPDF beside this script for reliable silent print, or set a PDF app as default. Printers: $list. $lastErr"
}

Write-Output "OK printed to $resolved (paper hint: $Paper)"
