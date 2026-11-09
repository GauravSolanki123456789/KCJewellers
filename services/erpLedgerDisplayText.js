/**
 * Compact bank-import references & narrations for ledger UI, CSV, and PDF.
 */

function norm(s) {
    return String(s || '')
        .replace(/\u00b9/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bankModeFromText(s) {
    const m = String(s || '').match(/\b(UPI|NEFT|RTGS|IMPS)\b/i);
    return m ? m[1].toUpperCase() : '';
}

/** Primary UTR / cheque id from IDFC-style narration. */
function extractPrimaryRef(raw) {
    const t = norm(raw);
    if (!t) return '';
    const upi = t.match(/UPI\/(?:CR|DR)\/([^/\s]+)/i);
    if (upi) return upi[1];
    const slash = t.match(/(?:NEFT|RTGS|IMPS)\/([^/\s]+)/i);
    if (slash) return slash[1];
    if (/^REC\d/i.test(t)) return t;
    if (/^SCB\d/i.test(t)) return t;
    if (/^PV\d/i.test(t)) return t;
    if (t.length <= 40) return t;
    return t.slice(0, 36) + '…';
}

function compactLedgerRef(ref) {
    const raw = norm(ref);
    if (!raw) return '';
    const primary = extractPrimaryRef(raw);
    const mode = bankModeFromText(raw);
    if (mode && primary && primary.length < raw.length) return `${mode} ${primary}`;
    if (raw.length > 44) return `${raw.slice(0, 40)}…`;
    return raw;
}

function narrationMostlyRef(ref, nar) {
    const r = norm(ref);
    const n = norm(nar);
    if (!r || !n) return false;
    if (n === r) return true;
    const without = n.replace(new RegExp(escapeRegex(r), 'gi'), ' ').replace(/\s+/g, ' ').trim();
    if (!without || without.length < 8) return true;
    return false;
}

function compactBankNarrationBody(ref, nar) {
    let n = norm(nar);
    if (!n) return '';
    const r = norm(ref);
    if (r && narrationMostlyRef(r, n)) return '';

    n = n.replace(/^\(V NO:\s*[^)]+\)\s*/i, '').trim();
    if (r && narrationMostlyRef(r, n)) return '';

    const parts = n.split('/').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && /^(UPI|NEFT|RTGS|IMPS)$/i.test(parts[0])) {
        const mode = parts[0].toUpperCase();
        if (mode === 'UPI') return '';

        const utr = extractPrimaryRef(n) || extractPrimaryRef(r);
        let party = '';
        for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            if (utr && p.toUpperCase() === utr.toUpperCase()) continue;
            if (/^[A-Z]{4}0[A-Z0-9]{6,}$/i.test(p)) continue;
            if (/^UPI$/i.test(p)) continue;
            if (/^C\/O/i.test(p)) break;
            if (p.length > 2 && !party) {
                party = p;
                break;
            }
        }
        const coMatch = n.match(/\bC\/O\b.*$/i);
        let addr = coMatch ? norm(coMatch[0]) : '';
        if (addr.length > 88) addr = `${addr.slice(0, 85)}…`;
        const head = party ? `${mode}/${party}` : mode;
        if (addr) return `${head} ${addr}`.trim();
        return head;
    }

    if (r) {
        n = n.replace(new RegExp(escapeRegex(r), 'gi'), ' ').replace(/\s+/g, ' ').trim();
    }
    if (n.length > 140) n = `${n.slice(0, 137)}…`;
    return n;
}

function compactVnoPaymentLine(vnoRaw, ref, bodyRaw) {
    const vno = extractPrimaryRef(vnoRaw || ref) || norm(vnoRaw) || norm(ref);
    if (!vno) return norm(bodyRaw);
    const body = compactBankNarrationBody(ref || vnoRaw, bodyRaw);
    if (!body) return `(V NO: ${vno})`;
    return `(V NO: ${vno}) ${body}`;
}

function compactExistingVnoDescription(desc, ref) {
    const d = norm(desc);
    const m = d.match(/^\(V NO:\s*([^)]+)\)\s*(.*)$/is);
    if (!m) return sanitizeLedgerDescriptionText(d);
    return compactVnoPaymentLine(m[1], ref, m[2]);
}

function sanitizeLedgerDescriptionText(desc) {
    return norm(desc)
        .replace(/\s*[—–-]\s*₹?\s*offset only.*$/gi, '')
        .replace(/\s*offset only.*$/gi, '')
        .trim();
}

function fmtReceiptDate(iso) {
    if (!iso) return '';
    const s = String(iso).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return '';
    return `${d}-${m}-${y.slice(2)}`;
}

function formatLedgerPaymentDescription(p, customerName, shadowBillById) {
    const ref = String(p.reference_no || '').trim();
    const nar = String(p.narration || '').trim();
    if (/^REC\d{4}-\d+/i.test(ref) || /^REC\d+$/i.test(ref)) {
        if (nar) return compactVnoPaymentLine(ref, ref, nar);
        return `(V NO: ${ref}) CASH - CASH RECEIVED`;
    }
    if (p.shadow_bill_id && shadowBillById && shadowBillById[p.shadow_bill_id]) {
        const sb = shadowBillById[p.shadow_bill_id];
        const billNo = sb.bill_number || ref;
        const name = String(sb.customer_name || customerName || '')
            .trim()
            .toUpperCase();
        const dt = fmtReceiptDate(sb.bill_date || p.entry_date);
        const recRef = /^REC/i.test(ref) ? ref : ref;
        const line = `CASH ${recRef} - ${name}${dt ? ` ${dt}` : ''} - ${billNo}`;
        return `(V NO: ${recRef}) ${line}`;
    }
    if (/^cash received$/i.test(nar) && /^SCB\d{4}-\d+/i.test(ref)) {
        const name = String(customerName || '')
            .trim()
            .toUpperCase();
        const dt = fmtReceiptDate(p.entry_date);
        const line = `CASH ${ref} - ${name}${dt ? ` ${dt}` : ''} - ${ref}`;
        return `(V NO: ${ref}) ${line}`;
    }
    if (nar) {
        if (/^\(V NO:/i.test(nar)) return compactExistingVnoDescription(nar, ref);
        if (ref) return compactVnoPaymentLine(ref, ref, nar);
        return compactBankNarrationBody('', nar) || nar;
    }
    if (ref) return compactVnoPaymentLine(ref, ref, '');
    return 'CASH - CASH RECEIVED';
}

function sanitizeLedgerDescription(desc) {
    const d = sanitizeLedgerDescriptionText(desc);
    if (/^\(V NO:/i.test(d)) return compactExistingVnoDescription(d, '');
    return d;
}

module.exports = {
    compactLedgerRef,
    extractPrimaryRef,
    compactBankNarrationBody,
    formatLedgerPaymentDescription,
    sanitizeLedgerDescription,
    sanitizeLedgerDescriptionText,
};
