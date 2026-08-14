param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

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

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, [In] DOCINFOA di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static int LastWin32Error;

    public static bool SendFileToPrinter(string printerName, string fileName) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            LastWin32Error = Marshal.GetLastWin32Error();
            return false;
        }
        try {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "KC ERP Label";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di)) {
                LastWin32Error = Marshal.GetLastWin32Error();
                return false;
            }
            try {
                if (!StartPagePrinter(hPrinter)) {
                    LastWin32Error = Marshal.GetLastWin32Error();
                    return false;
                }
                try {
                    byte[] bytes = File.ReadAllBytes(fileName);
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int written = 0;
                    bool ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    if (!ok || written != bytes.Length) {
                        LastWin32Error = Marshal.GetLastWin32Error();
                        return false;
                    }
                    return true;
                } finally {
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@

if (-not (Test-Path -LiteralPath $FilePath)) {
    Write-Error "Print file not found: $FilePath"
    exit 2
}

$resolved = Resolve-TscPrinterName $PrinterName
$installed = Get-InstalledPrinterNames
$listText = if ($installed.Count) { ($installed -join ' | ') } else { '(none — TSC driver not installed)' }

$ok = [RawPrinterHelper]::SendFileToPrinter($resolved, $FilePath)
if (-not $ok) {
    $err = [RawPrinterHelper]::LastWin32Error
    Write-Error @"
Raw print failed.
Requested: $PrinterName
Resolved:  $resolved
Win32 error: $err
Installed Windows printers: $listText

FIX: Install TSC TTP-244 driver so the printer appears in Settings > Printers.
Do NOT use Microsoft Print to PDF — that is a different printer.
"@
    exit 1
}

if ($resolved -ne $PrinterName) {
    Write-Host "Used printer: $resolved"
}
exit 0
