/** @typedef {{ street?: string; loc?: string; district?: string; dst?: string; pincode?: string; state_in_address?: string }} GstPradr */

function normalizeLineEndings(raw) {
    return String(raw || '')
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

function formatAddressToThreeLines(raw) {
    const t = normalizeLineEndings(raw).trim();
    if (!t) return '';

    const byNl = t
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    if (byNl.length >= 2) {
        if (byNl.length === 3) return byNl.join('\n');
        if (byNl.length === 2) return byNl.join('\n');
        return [byNl[0], byNl.slice(1, -1).join(', '), byNl[byNl.length - 1]].join('\n');
    }

    const parts = t
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length <= 1) return t;
    if (parts.length === 2) return parts.join('\n');
    if (parts.length === 3) return parts.join('\n');
    return [parts[0], parts.slice(1, -1).join(', '), parts[parts.length - 1]].join('\n');
}

function normalizeAddressField(raw) {
    const t = normalizeLineEndings(raw).trim();
    if (!t) return null;
    const explicitLines = t
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (explicitLines.length >= 2) {
        return explicitLines.slice(0, 3).join('\n');
    }
    const formatted = formatAddressToThreeLines(t);
    return formatted || null;
}

function trimMultilineStr(v, max = 2000) {
    if (v == null) return null;
    const normalized = normalizeAddressField(v);
    if (!normalized) return null;
    return normalized.slice(0, max);
}

function formatGstPradrToThreeLines(pradr, stateName, stateCode) {
    const p = pradr && typeof pradr === 'object' ? pradr : {};
    const line1 = [p.street, p.loc].filter(Boolean).join(', ').trim();
    const city = String(p.dst || p.district || p.loc || '').trim();
    const pin = String(p.pincode || '').trim();
    let line2 = '';
    if (city && pin) line2 = `${city.toUpperCase()}-${pin}`;
    else if (pin) line2 = pin;
    else if (city) line2 = city.toUpperCase();

    const st = String(stateName || p.state_in_address || '').trim();
    const code = String(stateCode || '').trim().padStart(2, '0');
    let line3 = '';
    if (st && code && code !== '00') line3 = `${st.toUpperCase()} (NEW) - ${code}`;
    else if (st) line3 = st.toUpperCase();

    const lines = [line1, line2, line3].filter((l) => l && l.trim());
    if (lines.length >= 2) return lines.join('\n');
    return formatAddressToThreeLines(lines[0] || '');
}

module.exports = {
    formatAddressToThreeLines,
    formatGstPradrToThreeLines,
    normalizeAddressField,
    trimMultilineStr,
};
