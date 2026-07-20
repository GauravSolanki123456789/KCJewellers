/**
 * Catalogue product ordering — admin `design_group_order` on web_subcategories,
 * with new (unsaved) design groups first by recency, then saved order, then size / updated_at within group.
 */

function normalizeDesignGroupOrder(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
        return raw.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) {
                return p.map((x) => String(x).trim()).filter(Boolean);
            }
        } catch {
            /* ignore */
        }
    }
    return [];
}

function compareCatalogSizeLabel(a, b) {
    const sa = String(a ?? '').trim();
    const sb = String(b ?? '').trim();
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

function productUpdatedMs(p) {
    const t = p?.updated_at != null ? new Date(p.updated_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
}

function findDesignGroupKey(groupKeys, savedKey) {
    const want = String(savedKey).trim().toLowerCase();
    if (!want) return null;
    return groupKeys.find((k) => k.toLowerCase() === want) ?? null;
}

/**
 * Merge saved design_group order with live groups.
 * Unknown groups (not in admin order) appear first, newest product first.
 */
function mergeDesignGroupOrderWithRecency(saved, discovered, products) {
    const disc = [...new Set(discovered.map((s) => String(s).trim()).filter(Boolean))];
    const savedClean = normalizeDesignGroupOrder(saved);
    const savedLower = new Set(savedClean.map((s) => s.toLowerCase()));

    const maxUpdatedByGroup = new Map();
    for (const p of products || []) {
        const dg = String(p?.design_group ?? '').trim();
        if (!dg) continue;
        const t = productUpdatedMs(p);
        const prev = maxUpdatedByGroup.get(dg) ?? 0;
        if (t > prev) maxUpdatedByGroup.set(dg, t);
    }

    const unknown = disc
        .filter((g) => !savedLower.has(g.toLowerCase()))
        .sort(
            (a, b) =>
                (maxUpdatedByGroup.get(b) ?? 0) - (maxUpdatedByGroup.get(a) ?? 0) ||
                a.localeCompare(b, undefined, { sensitivity: 'base' }),
        );

    const seen = new Set();
    const out = [];
    for (const g of unknown) {
        if (!seen.has(g.toLowerCase())) {
            out.push(g);
            seen.add(g.toLowerCase());
        }
    }
    for (const savedKey of savedClean) {
        const match = disc.find((g) => g.toLowerCase() === savedKey.toLowerCase());
        if (match && !seen.has(match.toLowerCase())) {
            out.push(match);
            seen.add(match.toLowerCase());
        }
    }
    for (const g of disc.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
        if (!seen.has(g.toLowerCase())) {
            out.push(g);
            seen.add(g.toLowerCase());
        }
    }
    return out;
}

function sortWithinDesignGroup(list) {
    return [...list].sort((a, b) => {
        const sizeCmp = compareCatalogSizeLabel(a.size, b.size);
        if (sizeCmp !== 0) return sizeCmp;
        const tb = productUpdatedMs(b) - productUpdatedMs(a);
        if (tb !== 0) return tb;
        return Number(a.id ?? 0) - Number(b.id ?? 0);
    });
}

/**
 * Sort products within one SKU/subcategory for storefront + shared brochure.
 */
function sortCatalogProductsByDesignGroupOrder(products, designGroupOrder) {
    if (!Array.isArray(products) || products.length <= 1) return products || [];

    const saved = normalizeDesignGroupOrder(designGroupOrder);
    const savedLower = new Set(saved.map((s) => s.toLowerCase()));
    const byGroup = new Map();
    const noGroup = [];

    for (const p of products) {
        const dg = String(p.design_group ?? '').trim();
        if (!dg) {
            noGroup.push(p);
            continue;
        }
        const bucket = byGroup.get(dg) ?? [];
        bucket.push(p);
        byGroup.set(dg, bucket);
    }

    const groupKeys = [...byGroup.keys()];
    const maxUpdatedByGroup = (dg) =>
        Math.max(...(byGroup.get(dg) ?? []).map(productUpdatedMs), 0);

    const unknownGroups = groupKeys
        .filter((dg) => !savedLower.has(dg.toLowerCase()))
        .sort(
            (a, b) =>
                maxUpdatedByGroup(b) - maxUpdatedByGroup(a) ||
                a.localeCompare(b, undefined, { sensitivity: 'base' }),
        );

    const orderedGroupKeys = [...unknownGroups];
    const seenGroups = new Set(orderedGroupKeys.map((g) => g.toLowerCase()));
    for (const savedKey of saved) {
        const match = findDesignGroupKey(groupKeys, savedKey);
        if (match && !seenGroups.has(match.toLowerCase())) {
            orderedGroupKeys.push(match);
            seenGroups.add(match.toLowerCase());
        }
    }
    for (const dg of groupKeys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
        if (!seenGroups.has(dg.toLowerCase())) {
            orderedGroupKeys.push(dg);
            seenGroups.add(dg.toLowerCase());
        }
    }

    const out = [];
    for (const dg of orderedGroupKeys) {
        out.push(...sortWithinDesignGroup(byGroup.get(dg) ?? []));
    }
    out.push(...sortWithinDesignGroup(noGroup));
    return out;
}

/** Compare two catalogue rows (shared catalogue / cross-SKU sort). */
function compareCatalogProductRows(a, b) {
    const catA = Number(a.category_sort ?? 0);
    const catB = Number(b.category_sort ?? 0);
    if (catA !== catB) return catA - catB;

    const subA = Number(a.subcategory_sort ?? 0);
    const subB = Number(b.subcategory_sort ?? 0);
    if (subA !== subB) return subA - subB;

    const saved = normalizeDesignGroupOrder(a.design_group_order ?? b.design_group_order);
    const savedLower = new Set(saved.map((s) => s.toLowerCase()));
    const dgA = String(a.design_group ?? '').trim();
    const dgB = String(b.design_group ?? '').trim();
    const inSavedA = dgA && savedLower.has(dgA.toLowerCase());
    const inSavedB = dgB && savedLower.has(dgB.toLowerCase());
    if (inSavedA !== inSavedB) return inSavedA ? 1 : -1;
    if (!inSavedA && !inSavedB && dgA && dgB) {
        const tb = productUpdatedMs(b) - productUpdatedMs(a);
        if (tb !== 0) return tb;
    }
    if (saved.length) {
        const idxA = dgA
            ? saved.findIndex((k) => k.toLowerCase() === dgA.toLowerCase())
            : 999999;
        const idxB = dgB
            ? saved.findIndex((k) => k.toLowerCase() === dgB.toLowerCase())
            : 999999;
        const rankA = idxA >= 0 ? idxA : 999998;
        const rankB = idxB >= 0 ? idxB : 999998;
        if (rankA !== rankB) return rankA - rankB;
    }
    const dgCmp = dgA.localeCompare(dgB, undefined, { sensitivity: 'base' });
    if (dgCmp !== 0) return dgCmp;

    const sizeCmp = compareCatalogSizeLabel(a.size, b.size);
    if (sizeCmp !== 0) return sizeCmp;

    const tb = productUpdatedMs(b) - productUpdatedMs(a);
    if (tb !== 0) return tb;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
}

module.exports = {
    normalizeDesignGroupOrder,
    mergeDesignGroupOrderWithRecency,
    sortCatalogProductsByDesignGroupOrder,
    compareCatalogProductRows,
    compareCatalogSizeLabel,
};
