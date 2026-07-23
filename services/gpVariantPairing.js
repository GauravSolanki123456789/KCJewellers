/**
 * Excel import: pair "SMALL PERUMAL" + "SMALL PERUMAL GP" as size variants (Standard / GP)
 * under one design_group — same UX as PEETAM 3x3 / 3x6 size chips.
 */

function trimField(value) {
    if (value == null) return '';
    return String(value).trim();
}

function normalizeGpBaseLabel(label) {
    return trimField(label)
        .replace(/\s+gp\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function rowLabel(item) {
    return trimField(item?.itemCode ?? item?.ItemCode ?? item?.name ?? item?.ProductName ?? '');
}

function isGpLabel(label) {
    return /\s+gp\s*$/i.test(trimField(label));
}

/** Bases that have both a standard row and a GP row in the same import batch. */
function detectGpPairedBases(items) {
    const gpBases = new Set();
    const stdBases = new Set();
    for (const item of items || []) {
        const label = rowLabel(item);
        if (!label) continue;
        const base = normalizeGpBaseLabel(label).toLowerCase();
        if (!base) continue;
        if (isGpLabel(label)) gpBases.add(base);
        else stdBases.add(base);
    }
    const paired = new Set();
    for (const base of gpBases) {
        if (stdBases.has(base)) paired.add(base);
    }
    return paired;
}

/**
 * When batch contains both X and X GP, collapse to design_group=X with size Standard|GP.
 * Physical dimensions from Excel Size column move to weight_display.
 */
function applyGpVariantPairing(item, pairedBases) {
    if (!item || !pairedBases || pairedBases.size === 0) return item;
    const label = rowLabel(item);
    if (!label) return item;
    const base = normalizeGpBaseLabel(label);
    const baseKey = base.toLowerCase();
    if (!pairedBases.has(baseKey)) return item;

    const physSize = trimField(item.size ?? item.Size);
    const isGp = isGpLabel(label);

    return {
        ...item,
        itemCode: base,
        ItemCode: base,
        size: isGp ? 'GP' : 'Standard',
        Size: isGp ? 'GP' : 'Standard',
        weightDisplay:
            trimField(item.weightDisplay ?? item.weight_display) || physSize || undefined,
        weight_display:
            trimField(item.weightDisplay ?? item.weight_display) || physSize || undefined,
    };
}

module.exports = {
    normalizeGpBaseLabel,
    detectGpPairedBases,
    applyGpVariantPairing,
};
