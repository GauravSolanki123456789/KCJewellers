KC ERP — Label Print Service (USB / USB001)
============================================

COPY THIS ENTIRE FOLDER to the shop PC Desktop.
Do NOT copy only the .bat file — all 3 files must stay together.

Files in this folder:
  START-KC-Label-Print.bat      ← double-click this every day
  erp-local-print-agent.ps1
  windows-raw-print.ps1

Daily use:
  1. Double-click START-KC-Label-Print.bat
  2. Leave the black window open
  3. Open Chrome → kcjewellers.co.in → ERP → Products
  4. Click Refresh on "Label printer (USB)" until green
  5. Generate barcodes

No Node.js or Python needed — Windows PowerShell only.

Printer must be on port USB001 in Windows (not Print to File).
ERP Hardware → Connection: USB (Windows · USB001)
Windows printer name: TSC TTP-244 Pro (exact name from Windows Printers)

Zebra GC420t:
  ERP Hardware → + Zebra GC420t (or add printer manually)
  Label format: ZPL (Zebra GC420t)
  Windows printer name: exact name from Settings → Printers (e.g. Zebra GC420t - EPL)
  ERP Print formats → Label (Zebra) → paste/upload your ZPL (.prn), Save
  After updating this folder on the shop PC: close the print window and run START-KC-Label-Print.bat again.

If start fails: right-click START-KC-Label-Print.bat → Run as administrator (once).
