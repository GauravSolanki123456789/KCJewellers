/** Mirror of services/erpLedgerDisplayText.js — compact bank refs for ledger PDF/UI. */

function norm(s: string | null | undefined): string {
  return String(s || '')
    .replace(/\u00b9/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegex(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function bankModeFromText(s: string): string {
  const m = String(s || '').match(/\b(UPI|NEFT|RTGS|IMPS)\b/i)
  return m ? m[1].toUpperCase() : ''
}

export function extractPrimaryLedgerRef(raw: string | null | undefined): string {
  const t = norm(raw)
  if (!t) return ''
  const upi = t.match(/UPI\/(?:CR|DR)\/([^/\s]+)/i)
  if (upi) return upi[1]
  const slash = t.match(/(?:NEFT|RTGS|IMPS)\/([^/\s]+)/i)
  if (slash) return slash[1]
  if (t.length <= 40) return t
  return `${t.slice(0, 36)}…`
}

export function compactLedgerRefDisplay(ref: string | null | undefined): string {
  const raw = norm(ref)
  if (!raw) return ''
  const primary = extractPrimaryLedgerRef(raw)
  const mode = bankModeFromText(raw)
  if (mode && primary && primary.length < raw.length) return `${mode} ${primary}`
  if (raw.length > 44) return `${raw.slice(0, 40)}…`
  return raw
}

export function compactLedgerDescriptionForPdf(raw: string | null | undefined): string {
  let d = norm(raw)
    .replace(/₹/g, 'Rs. ')
    .replace(/\s*[—–-]\s*Rs\.?\s*offset only.*$/gi, '')
    .replace(/\s*offset only.*$/gi, '')

  const vno = d.match(/^\(V NO:\s*([^)]+)\)\s*([\s\S]*)$/i)
  if (!vno) return d

  const utr = extractPrimaryLedgerRef(vno[1]) || norm(vno[1])
  let body = norm(vno[2])
  if (body) {
    body = body.replace(new RegExp(escapeRegex(vno[1]), 'gi'), ' ').replace(/\s+/g, ' ').trim()
    const parts = body.split('/').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2 && /^(UPI|NEFT|RTGS|IMPS)$/i.test(parts[0])) {
      const mode = parts[0].toUpperCase()
      if (mode === 'UPI') body = ''
      else {
        let party = ''
        for (let i = 1; i < parts.length; i++) {
          const p = parts[i]
          if (utr && p.toUpperCase() === utr.toUpperCase()) continue
          if (/^[A-Z]{4}0[A-Z0-9]{6,}$/i.test(p)) continue
          if (/^UPI$/i.test(p)) continue
          if (/^C\/O/i.test(p)) break
          if (p.length > 2 && !party) party = p
        }
        const coMatch = body.match(/\bC\/O\b.*$/i)
        let addr = coMatch ? norm(coMatch[0]) : ''
        if (addr.length > 88) addr = `${addr.slice(0, 85)}…`
        body = party ? `${mode}/${party}${addr ? ` ${addr}` : ''}` : mode
      }
    }
    if (body.length > 140) body = `${body.slice(0, 137)}…`
  }
  if (!body) return `(V NO: ${utr})`
  return `(V NO: ${utr}) ${body}`
}
