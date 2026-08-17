#!/usr/bin/env python3
"""
KC ERP — local Windows USB label print agent (Python).
Optional alternative if Python is installed. Usually use start-erp-print-agent.bat instead.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

PORT = int(os.environ.get("ERP_PRINT_AGENT_PORT", "17888"))
HOST = "127.0.0.1"
SCRIPT_DIR = Path(__file__).resolve().parent
RAW_PRINT_PS1 = SCRIPT_DIR / "windows-raw-print.ps1"


def print_raw_binary(printer_name: str, esc_pos_base64: str) -> None:
    suffix = os.urandom(4).hex()
    fd, tmp = tempfile.mkstemp(prefix=f"kc-erp-receipt-{suffix}-", suffix=".bin")
    os.close(fd)
    try:
        Path(tmp).write_bytes(base64.b64decode(str(esc_pos_base64 or "")))
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(RAW_PRINT_PS1),
                "-PrinterName",
                printer_name,
                "-FilePath",
                tmp,
            ],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(detail or f"Receipt print failed for {printer_name}")
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def print_raw(printer_name: str, tspl: str) -> None:
    suffix = os.urandom(4).hex()
    fd, tmp = tempfile.mkstemp(prefix=f"kc-erp-label-{suffix}-", suffix=".prn")
    os.close(fd)
    try:
        Path(tmp).write_text(str(tspl or ""), encoding="utf-8")
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(RAW_PRINT_PS1),
                "-PrinterName",
                printer_name,
                "-FilePath",
                tmp,
            ],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(detail or f"Raw print failed for {printer_name}")
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self._json(
                200,
                {
                    "ok": True,
                    "service": "kc-erp-local-print",
                    "port": PORT,
                    "runtime": "python",
                    "supportsReceipt": True,
                    "supportsLabels": True,
                },
            )
            return
        if self.path.rstrip("/") == "/printers":
            try:
                out = subprocess.check_output(
                    [
                        "powershell.exe",
                        "-NoProfile",
                        "-Command",
                        "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
                    ],
                    text=True,
                    timeout=15,
                )
                parsed = json.loads(out or "[]")
                names = parsed if isinstance(parsed, list) else [parsed] if parsed else []
                self._json(200, {"ok": True, "printers": names})
            except Exception as exc:
                self._json(500, {"ok": False, "error": str(exc)})
            return
        self._json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path == "/print-receipt":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length > 2_000_000:
                    raise ValueError("Payload too large")
                raw = self.rfile.read(length).decode("utf-8") if length else "{}"
                payload = json.loads(raw or "{}")
                printer_name = str(payload.get("printerName") or "EPSON TM-m30III Receipt").strip()
                if not payload.get("escPosBase64"):
                    self._json(400, {"ok": False, "error": "No receipt data"})
                    return
                print_raw_binary(printer_name, str(payload["escPosBase64"]))
                self._json(200, {"ok": True, "count": 1, "printerName": printer_name, "kind": "receipt"})
            except Exception as exc:
                self._json(500, {"ok": False, "error": str(exc)})
            return
        if path != "/print":
            self._json(404, {"ok": False, "error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 2_000_000:
                raise ValueError("Payload too large")
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            payload = json.loads(raw or "{}")
            printer_name = str(payload.get("printerName") or "TSC TTP-244 Pro").strip()
            if payload.get("escPosBase64"):
                print_raw_binary(printer_name, str(payload["escPosBase64"]))
                self._json(200, {"ok": True, "count": 1, "printerName": printer_name, "kind": "receipt"})
                return
            tspl_list = payload.get("tsplList")
            if tspl_list is None and payload.get("tspl"):
                tspl_list = [payload["tspl"]]
            tspl_list = list(tspl_list or [])
            if not tspl_list:
                self._json(400, {"ok": False, "error": "No TSPL or receipt data"})
                return
            for i, item in enumerate(tspl_list):
                print_raw(printer_name, str(item))
                if i < len(tspl_list) - 1:
                    time.sleep(0.45)
            self._json(200, {"ok": True, "count": len(tspl_list), "printerName": printer_name})
        except Exception as exc:
            self._json(500, {"ok": False, "error": str(exc)})


def main() -> None:
    print("")
    print("========================================")
    print(" KC ERP Label Print Service (USB001)")
    print("========================================")
    print(f" Listening on http://{HOST}:{PORT}/")
    print(" Keep this window OPEN while printing from Chrome.")
    print(" Press Ctrl+C to stop.")
    print("")
    server = HTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
