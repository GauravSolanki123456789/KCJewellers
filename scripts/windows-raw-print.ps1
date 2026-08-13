param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

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

    public static bool SendFileToPrinter(string printerName, string fileName) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        try {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "KC ERP Label";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di)) return false;
            try {
                if (!StartPagePrinter(hPrinter)) return false;
                try {
                    byte[] bytes = File.ReadAllBytes(fileName);
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int written = 0;
                    bool ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    return ok && written == bytes.Length;
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

$ok = [RawPrinterHelper]::SendFileToPrinter($PrinterName, $FilePath)
if (-not $ok) {
    Write-Error "Raw print failed for printer: $PrinterName"
    exit 1
}
exit 0
