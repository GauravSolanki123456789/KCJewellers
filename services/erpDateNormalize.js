/**
 * Normalize ERP / PostgreSQL dates to ISO yyyy-mm-dd (avoids node-pg Date → "Sat Sep 27" bugs).
 */

/** Calendar date from a JS Date (local TZ — matches India shop PCs and node-pg DATE). */
function dateObjectToIso(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDmyToIso(dd, mm, yyyy) {
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return null;
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function parseDateOrNull(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return dateObjectToIso(v);
    const raw = String(v).trim();
    const dmy4 = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
    if (dmy4) {
        return parseDmyToIso(
            parseInt(dmy4[1], 10),
            parseInt(dmy4[2], 10),
            parseInt(dmy4[3], 10),
        );
    }
    const s = raw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const isoT = /^(\d{4}-\d{2}-\d{2})T/.exec(raw);
    if (isoT) return isoT[1];
    const dmy2 = /^(\d{2})-(\d{2})-(\d{2})$/.exec(raw);
    if (dmy2) {
        const yy = parseInt(dmy2[3], 10);
        const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
        return parseDmyToIso(parseInt(dmy2[1], 10), parseInt(dmy2[2], 10), yyyy);
    }
    if (/^[A-Za-z]{3}\s/.test(raw)) {
        const dt = new Date(raw);
        if (!Number.isNaN(dt.getTime())) return dateObjectToIso(dt);
    }
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime()) && /[T\s]/.test(raw)) return dateObjectToIso(dt);
    return null;
}

/** Always returns yyyy-mm-dd or empty string. */
function normDateIso(d) {
    const parsed = parseDateOrNull(d);
    if (parsed) return parsed;
    return '';
}

function tallyDateYmd(isoDate) {
    const iso = normDateIso(isoDate);
    if (!iso) return '';
    return iso.replace(/-/g, '');
}

module.exports = {
    dateObjectToIso,
    parseDateOrNull,
    normDateIso,
    tallyDateYmd,
};
