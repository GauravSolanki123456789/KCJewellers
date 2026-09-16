/**
 * Exhibition offline billing — A/S/B/G manual entry, catalogue helpers, line totals.
 * Loaded by exhibition-kit/index.html (no bundler).
 */
(function (global) {
  const BARCODE_STORAGE = 'kc-exhibition-manual-barcodes-v1';

  const CATEGORY_LABELS = {
    articles: ['SILVER ARTICLES', 'SILVER ARTICLE'],
    jewellery: ['SILVER JEWELLERY', 'SILVER JEWELRY'],
    bullion: ['SILVER BAR', 'GRAINS', 'SILVER BULLION'],
    gift: ['GIFT ITEMS', 'GIFT ITEM'],
  };

  const BILLING_SCAN_SHORTCUTS = { A: 'articles', S: 'jewellery', B: 'bullion', G: 'gift' };

  const MANUAL_ENTRY_FIELD_ORDER = [
    'sku', 'style_code', 'name', 'size', 'weightGm', 'gross_weight', 'bags', 'bag_wt',
    'purity', 'wastage_pct', 'mc_rate', 'mc_type', 'qty', 'box_charges', 'stone_charges',
  ];

  const GIFT_ENTRY_FIELD_ORDER = ['sku', 'style_code', 'name', 'size', 'qty'];

  function loadUsedBarcodes() {
    try {
      const raw = localStorage.getItem(BARCODE_STORAGE);
      const list = raw ? JSON.parse(raw) : [];
      return new Set((list || []).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveUsedBarcodes(used) {
    try {
      localStorage.setItem(BARCODE_STORAGE, JSON.stringify([...used].slice(-5000)));
    } catch (_) {}
  }

  function randomDigits(length) {
    let out = '';
    for (let i = 0; i < length; i += 1) out += String(Math.floor(Math.random() * 10));
    if (out[0] === '0') out = String(Math.floor(Math.random() * 9) + 1) + out.slice(1);
    return out;
  }

  function generateManualBarcode(extraUsed) {
    const used = loadUsedBarcodes();
    (extraUsed || []).forEach((code) => {
      const c = String(code || '').trim();
      if (c) used.add(c);
    });
    for (let len = 6; len <= 10; len += 1) {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        const candidate = randomDigits(len);
        if (!used.has(candidate)) {
          used.add(candidate);
          saveUsedBarcodes(used);
          return candidate;
        }
      }
    }
    const fallback = randomDigits(10);
    used.add(fallback);
    saveUsedBarcodes(used);
    return fallback;
  }

  function resolveBillingScanShortcut(code) {
    const key = String(code || '').trim().toUpperCase();
    if (key.length !== 1) return null;
    return BILLING_SCAN_SHORTCUTS[key] || null;
  }

  function findInvoiceItemForCategory(category, items) {
    const labels = (CATEGORY_LABELS[category] || []).map((x) => x.toUpperCase());
    for (const label of labels) {
      const hit = (items || []).find((it) => String(it.name || '').trim().toUpperCase() === label);
      if (hit) return hit;
    }
    for (const label of labels) {
      const hit = (items || []).find((it) => String(it.name || '').trim().toUpperCase().includes(label.split(' ')[0]));
      if (hit) return hit;
    }
    return null;
  }

  function skuKey(sku) {
    return String(sku || '').trim().toUpperCase();
  }

  function uniqueSkusFromCatalog(catalog) {
    const bySku = Object.create(null);
    for (const s of catalog || []) {
      for (const sk of s.skus || []) {
        const key = skuKey(sk.sku);
        if (!key) continue;
        const incoming = {
          sku: String(sk.sku || '').trim(),
          style_code: s.style_code,
          product_name: sk.product_name,
          product_names: sk.product_names,
        };
        const existing = bySku[key];
        if (!existing) {
          bySku[key] = incoming;
          continue;
        }
        const incomingScore = (incoming.product_names?.length || 0) + (incoming.product_name ? 1 : 0);
        const existingScore = (existing.product_names?.length || 0) + (existing.product_name ? 1 : 0);
        if (incomingScore > existingScore) bySku[key] = incoming;
      }
    }
    return Object.values(bySku).sort((a, b) => a.sku.localeCompare(b.sku));
  }

  function findStyleForSku(catalog, sku) {
    const hit = uniqueSkusFromCatalog(catalog).find((x) => skuKey(x.sku) === skuKey(sku));
    return hit ? hit.style_code : null;
  }

  function findStylesForSku(catalog, sku) {
    const q = skuKey(sku);
    const styles = [];
    const seen = new Set();
    for (const s of catalog || []) {
      if (!(s.skus || []).some((sk) => skuKey(sk.sku) === q)) continue;
      const code = String(s.style_code || '').trim();
      const k = code.toUpperCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      styles.push(code);
    }
    return styles;
  }

  function productNamesForSku(catalog, sku) {
    const entry = uniqueSkusFromCatalog(catalog).find((x) => skuKey(x.sku) === skuKey(sku));
    if (entry?.product_names?.length) return entry.product_names;
    const out = [];
    const seen = new Set();
    for (const s of catalog || []) {
      for (const sk of s.skus || []) {
        if (skuKey(sk.sku) !== skuKey(sku)) continue;
        for (const p of sk.product_names || []) {
          const k = String(p.name || '').trim().toUpperCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          out.push(p);
        }
        if (sk.product_name) {
          const k = String(sk.product_name).trim().toUpperCase();
          if (k && !seen.has(k)) {
            seen.add(k);
            out.push({ name: sk.product_name });
          }
        }
      }
    }
    return out;
  }

  function findCatalogProduct(catalog, name) {
    const q = String(name || '').trim().toUpperCase();
    if (!q || !catalog?.length) return null;
    return catalog.find((p) => String(p.name || '').trim().toUpperCase() === q) || null;
  }

  function patchLineFromCatalogProduct(line, product) {
    const patch = {
      name: product.name,
      mc_rate: product.mc_rate != null ? product.mc_rate : line.mc_rate,
      mc_type: product.mc_type || line.mc_type,
      wastage_pct: product.wastage_pct != null ? product.wastage_pct : line.wastage_pct,
      purity: product.purity != null ? product.purity : line.purity,
      metal_type: product.metal_type || line.metal_type || 'silver',
      fixed_price: product.fixed_price != null ? product.fixed_price : line.fixed_price,
      designSizeOptions: (product.sizes || []).map((s) => ({ size_label: s.size_label })),
      designBoxOptions: product.box_options?.length ? product.box_options : undefined,
      designFinishOptions: product.finish_options?.length ? product.finish_options : undefined,
      size: null,
      weightGm: null,
      net_weight: null,
      box_charges: 0,
      stone_charges: product.stone_charges != null ? product.stone_charges : 0,
    };
    if (product.sizes?.length === 1) {
      const s = product.sizes[0];
      patch.size = s.size_label;
      if (s.net_weight != null) {
        patch.weightGm = s.net_weight;
        patch.net_weight = s.net_weight;
      }
      if (s.gross_weight != null) patch.gross_weight = s.gross_weight;
      if (s.mc_rate != null) patch.mc_rate = s.mc_rate;
      if (s.mc_type) patch.mc_type = s.mc_type;
      if (s.wastage_pct != null) patch.wastage_pct = s.wastage_pct;
      if (s.purity != null) patch.purity = s.purity;
      if (s.fixed_price != null) patch.fixed_price = s.fixed_price;
    }
    return patch;
  }

  function patchLineFromCatalogSize(line, product, sizeLabel) {
    const hit = (product.sizes || []).find((s) => s.size_label === sizeLabel);
    if (!hit) return { size: sizeLabel || null };
    return {
      size: sizeLabel,
      weightGm: hit.net_weight != null ? hit.net_weight : line.weightGm,
      net_weight: hit.net_weight != null ? hit.net_weight : line.net_weight,
      gross_weight: hit.gross_weight != null ? hit.gross_weight : line.gross_weight,
      mc_rate: hit.mc_rate != null ? hit.mc_rate : line.mc_rate,
      mc_type: hit.mc_type || line.mc_type,
      wastage_pct: hit.wastage_pct != null ? hit.wastage_pct : line.wastage_pct,
      purity: hit.purity != null ? hit.purity : line.purity,
      fixed_price: hit.fixed_price != null ? hit.fixed_price : line.fixed_price,
    };
  }

  function nextFieldAfterCatalogProduct(product) {
    if ((product.sizes?.length || 0) > 1) return 'size';
    if ((product.finish_options?.length || 0) >= 2) return 'stone_charges';
    if ((product.box_options?.length || 0) >= 2) return 'box_charges';
    return 'weightGm';
  }

  function isGiftManualLine(line) {
    return line.manualCategory === 'gift' || !!line.mrpMode;
  }

  function entryFieldOrderForLine(line) {
    return isGiftManualLine(line) ? GIFT_ENTRY_FIELD_ORDER : MANUAL_ENTRY_FIELD_ORDER;
  }

  function firstManualEntryField(line) {
    return entryFieldOrderForLine(line)[0] || 'sku';
  }

  function nextManualEntryField(current, line) {
    const order = line ? entryFieldOrderForLine(line) : MANUAL_ENTRY_FIELD_ORDER;
    const idx = order.indexOf(current);
    if (idx < 0 || idx >= order.length - 1) return null;
    return order[idx + 1];
  }

  function createManualBillLine(category, invoiceItem, slab, usedCodes) {
    const lineId = generateManualBarcode(usedCodes);
    const isGiftOrMrp = category === 'gift' || !!invoiceItem.mrp;
    return {
      name: category === 'gift' ? '' : invoiceItem.name,
      code: lineId,
      barcode: lineId,
      sku: '',
      style_code: '',
      size: null,
      qty: category === 'gift' ? 0 : 1,
      weightGm: null,
      net_weight: null,
      gross_weight: null,
      bag_wt: null,
      bags: null,
      purity: null,
      wastage_pct: null,
      mc_rate: null,
      mc_type: null,
      box_charges: 0,
      stone_charges: 0,
      metal_type: 'silver',
      fixed_price: null,
      lineTotalInr: 0,
      invoice_item_name: invoiceItem.name,
      hsn_code: invoiceItem.hsn,
      manualEntry: true,
      manualEntryOpen: true,
      manualCategory: category,
      mrpMode: isGiftOrMrp ? true : undefined,
    };
  }

  function parseMetalSlabFraction(raw) {
    if (raw == null || raw === '') return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    if (n > 1) return Math.min(1, Math.max(0, n / 100));
    if (n > 0 && n <= 1) return n;
    return 1;
  }

  function pieceSlabMcRate(piece, slab) {
    if (slab === 'W') return piece.mc_rate_slab_w ?? piece.mc_rate_slab_r ?? piece.mc_rate ?? 0;
    if (slab === 'F') return piece.mc_rate_slab_f ?? piece.mc_rate_slab_w ?? piece.mc_rate ?? 0;
    return piece.mc_rate_slab_r ?? piece.mc_rate ?? 0;
  }

  function pieceSlabMetalFraction(piece, slab) {
    if (slab === 'W') return parseMetalSlabFraction(piece.metal_slab_w_pct ?? piece.metal_slab_r_pct ?? 1);
    if (slab === 'F') return parseMetalSlabFraction(piece.metal_slab_f_pct ?? piece.metal_slab_w_pct ?? 1);
    return parseMetalSlabFraction(piece.metal_slab_r_pct ?? 1);
  }

  function isMcPerGm(mcType) {
    const t = String(mcType || '').toLowerCase();
    return !(t.includes('piece') || t.includes('pcs'));
  }

  function calcLineTotal(piece, rates, slab) {
    const silverPerG = Number(rates.silver_per_gram) || 0;
    const goldPerG = Number(rates.gold_per_gram) || 0;
    const net = Number(piece.net_weight ?? piece.weightGm) || 0;
    const fixed = Number(piece.fixed_price) || 0;
    const qty = Number(piece.qty ?? piece.pcs) || 1;
    if (fixed > 0 && net <= 0 && (piece.mrpMode || piece.manualCategory === 'gift')) {
      return Math.round(fixed * qty * 1.03);
    }
    if (fixed > 0 && net <= 0) return Math.round(fixed * qty * 1.03);
    const metal = String(piece.metal_type || 'silver').toLowerCase();
    const frac = pieceSlabMetalFraction(piece, slab);
    const billWt = Math.round(net * frac * 1000) / 1000;
    const mcRate = Number(pieceSlabMcRate(piece, slab)) || 0;
    let metalRate = silverPerG;
    if (metal.startsWith('gold')) {
      const p = Number(piece.purity) || 75;
      if (p >= 90) metalRate = rates.gold_22k_per_gram || goldPerG;
      else if (p >= 74) metalRate = rates.gold_18k_per_gram || goldPerG * 0.75;
      else metalRate = goldPerG;
    }
    const stone = Number(piece.stone_charges) || 0;
    const box = Number(piece.box_charges) || 0;
    const mcGm = isMcPerGm(piece.mc_type);
    let metalPart, mc;
    if (mcGm) {
      const combined = Math.round((metalRate + mcRate) * billWt);
      metalPart = Math.round(metalRate * billWt);
      mc = combined - metalPart;
    } else {
      metalPart = Math.round(metalRate * billWt);
      mc = Math.round(mcRate * qty);
    }
    const taxable = metalPart + mc + stone + box;
    return Math.round(taxable * 1.03);
  }

  global.KcExhibitionBilling = {
    generateManualBarcode,
    resolveBillingScanShortcut,
    findInvoiceItemForCategory,
    createManualBillLine,
    uniqueSkusFromCatalog,
    findStyleForSku,
    findStylesForSku,
    productNamesForSku,
    findCatalogProduct,
    patchLineFromCatalogProduct,
    patchLineFromCatalogSize,
    nextFieldAfterCatalogProduct,
    firstManualEntryField,
    nextManualEntryField,
    entryFieldOrderForLine,
    isGiftManualLine,
    calcLineTotal,
    MANUAL_ENTRY_FIELD_ORDER,
    GIFT_ENTRY_FIELD_ORDER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
