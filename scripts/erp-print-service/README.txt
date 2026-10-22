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

TVS LP 46 NEO (SNBC driver):
  ERP Hardware → add printer, Label format: PRN template (TVS LP46)
  Windows printer name: exact name from Settings → Printers (e.g. SNBC TVSE LP 46 NEO BPLE)
  USB port (USB005 etc.) is fine — match the name in Hardware, not the port letter.

Zebra GC420t:
  ERP Hardware → + Zebra GC420t (or add printer manually)
  Label format: ZPL (Zebra GC420t)
  Windows printer name: exact name from Settings → Printers (e.g. Zebra GC420t - EPL)
  ERP Print formats → Label (Zebra) → paste/upload your ZPL (.prn), Save
  After updating this folder on the shop PC: close the print window and run START-KC-Label-Print.bat again.

Chrome on kcjewellers.co.in (HTTPS):
  If the black window says Listening on 17888 but ERP stays amber:
  Lock icon → Site settings → Local network / Loopback → Allow, then Refresh in ERP.
  Re-copy this entire folder after software updates (CORS fix for local printing).

If start fails: right-click START-KC-Label-Print.bat → Run as administrator (once).
