/**
 * KC ERP — local Windows USB label print agent.
 * Run on the shop PC: node scripts/erp-local-print-agent.js
 * Sends raw TSPL to the TSC printer installed as USB001 (Windows spooler name).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.ERP_PRINT_AGENT_PORT || 17888);
const HOST = '127.0.0.1';
const PS1 = path.join(__dirname, 'windows-raw-print.ps1');

async function printRaw(printerName, tspl) {
    const tmp = path.join(os.tmpdir(), `kc-erp-label-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.prn`);
    fs.writeFileSync(tmp, String(tspl || ''), 'utf8');
    try {
        await execFileAsync(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-PrinterName', printerName, '-FilePath', tmp],
            { timeout: 45000, windowsHide: true },
        );
    } finally {
        try {
            fs.unlinkSync(tmp);
        } catch {
            /* ignore */
        }
    }
}

async function printRawBinary(printerName, escPosBase64) {
    const tmp = path.join(os.tmpdir(), `kc-erp-receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.bin`);
    fs.writeFileSync(tmp, Buffer.from(String(escPosBase64 || ''), 'base64'));
    try {
        await execFileAsync(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-PrinterName', printerName, '-FilePath', tmp],
            { timeout: 45000, windowsHide: true },
        );
    } finally {
        try {
            fs.unlinkSync(tmp);
        } catch {
            /* ignore */
        }
    }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2_000_000) reject(new Error('Payload too large'));
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'kc-erp-local-print', port: PORT }));
        return;
    }

    if (req.method === 'GET' && req.url === '/printers') {
        try {
            const { stdout } = await execFileAsync(
                'powershell.exe',
                [
                    '-NoProfile',
                    '-Command',
                    'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress',
                ],
                { timeout: 15000, windowsHide: true },
            );
            let names = [];
            try {
                const parsed = JSON.parse(stdout || '[]');
                names = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
            } catch {
                names = [];
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, printers: names }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message || 'Could not list printers' }));
        }
        return;
    }

    if (req.method === 'POST' && req.url === '/print') {
        try {
            const body = await readBody(req);
            const payload = JSON.parse(body || '{}');
            const printerName = String(payload.printerName || 'TSC TTP-244 Pro').trim();

            if (payload.escPosBase64) {
                await printRawBinary(printerName, payload.escPosBase64);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, count: 1, printerName, kind: 'receipt' }));
                return;
            }

            const list = Array.isArray(payload.tsplList)
                ? payload.tsplList
                : payload.tspl
                  ? [payload.tspl]
                  : [];
            if (!list.length) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'No TSPL or receipt data' }));
                return;
            }
            for (let i = 0; i < list.length; i += 1) {
                await printRaw(printerName, list[i]);
                if (i < list.length - 1) {
                    await new Promise((r) => setTimeout(r, 450));
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, count: list.length, printerName, kind: 'label' }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message || 'Print failed' }));
        }
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, HOST, () => {
    console.log(`KC ERP local print agent listening on http://${HOST}:${PORT}`);
    console.log('Keep this window open while printing labels from the ERP in Chrome.');
    console.log('Default printer name: TSC TTP-244 Pro (change in Hardware → USB settings).');
});
