# KC ERP — GDI text print for inkjet / laser cut-sheet printers (Epson L3310, A5/A4).
# Do not send ESC/POS raw to these printers.
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string]$Paper = 'A5',
    [double]$MarginMm = 10,
    [double]$FontPt = 9,
    [string]$FontName = 'Courier New'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "Print file not found: $FilePath"
}

function Get-PaperHundredths([string]$Kind) {
    switch ($Kind.Trim().ToUpper()) {
        'A4' { return @{ W = 827; H = 1169 } }
        'A6' { return @{ W = 413; H = 583 } }
        'LETTER' { return @{ W = 850; H = 1100 } }
        'HALFLETTER' { return @{ W = 550; H = 850 } }
        'HALLETTER' { return @{ W = 550; H = 850 } }
        default { return @{ W = 583; H = 827 } }
    }
}

$text = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
$script:lines = @($text -split "`r?`n")
$script:lineIndex = 0

$names = @()
try { $names = @(Get-Printer | Select-Object -ExpandProperty Name) } catch { $names = @() }
$resolved = $PrinterName
if ($names -notcontains $PrinterName) {
    foreach ($n in $names) {
        if ($n -match 'L3310|L-3310|EcoTank|L3250|L3210') { $resolved = $n; break }
    }
}

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $resolved
$doc.DocumentName = 'KC ERP Estimate'
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

$sz = Get-PaperHundredths $Paper
$paperSize = New-Object System.Drawing.Printing.PaperSize 'KCEstimate', $sz.W, $sz.H
$matched = $null
foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    $kindName = ''
    try { $kindName = $ps.Kind.ToString() } catch { $kindName = '' }
    if ($ps.PaperName -match [regex]::Escape($Paper) -or $kindName -eq $Paper) {
        $matched = $ps
        break
    }
}
if ($matched) {
    $doc.DefaultPageSettings.PaperSize = $matched
} else {
    $doc.DefaultPageSettings.PaperSize = $paperSize
}
$doc.DefaultPageSettings.Landscape = $false
$margin = [Math]::Max(20, [int][Math]::Round($MarginMm * 3.937))
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins $margin, $margin, $margin, $margin

$fontNameUse = if ([string]::IsNullOrWhiteSpace($FontName)) { 'Courier New' } else { $FontName }
$fontPtUse = if ($FontPt -lt 6) { 9 } else { [double]$FontPt }
$font = New-Object System.Drawing.Font $fontNameUse, $fontPtUse, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Point)

$doc.add_PrintPage({
    param($sender, $e)
    $brush = [System.Drawing.Brushes]::Black
    $lineHeight = [double]$font.GetHeight($e.Graphics)
    $y = [double]$e.MarginBounds.Top
    $left = [float]$e.MarginBounds.Left
    $maxW = [float]$e.MarginBounds.Width
    while ($script:lineIndex -lt $script:lines.Count) {
        if (($y + $lineHeight) -gt $e.MarginBounds.Bottom + 0.5) {
            $e.HasMorePages = $true
            return
        }
        $line = [string]$script:lines[$script:lineIndex]
        if ($line.Length -eq 0) {
            $y += $lineHeight
            $script:lineIndex++
            continue
        }
        $size = $e.Graphics.MeasureString($line, $font, [int]$maxW)
        $h = [Math]::Max($lineHeight, [double]$size.Height)
        if (($y + $h) -gt $e.MarginBounds.Bottom + 0.5 -and $script:lineIndex -gt 0) {
            $e.HasMorePages = $true
            return
        }
        $rect = New-Object System.Drawing.RectangleF $left, ([float]$y), $maxW, ([float]$h)
        $e.Graphics.DrawString($line, $font, $brush, $rect)
        $y += $h
        $script:lineIndex++
    }
    $e.HasMorePages = $false
})

try {
    $doc.Print()
} catch {
    $list = if ($names.Count) { ($names -join ', ') } else { 'none' }
    throw "Sheet print failed ($resolved). Installed printers: $list. $($_.Exception.Message)"
} finally {
    $font.Dispose()
    $doc.Dispose()
}
