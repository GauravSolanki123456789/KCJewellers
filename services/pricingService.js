function pickRateFromTable(metalType, liveRates, mode) {
  const t = (metalType || 'gold').toLowerCase();
  if (!liveRates) return 0;
  if (typeof liveRates === 'object' && ('gold' in liveRates || 'silver' in liveRates || 'platinum' in liveRates)) {
    return Number(liveRates[t]) || 0;
  }
  if (Array.isArray(liveRates)) {
    const row = liveRates.find(r => (r.metal_type || r.metalType || '').toLowerCase() === t);
    if (!row) return 0;
    if (mode === 'sell') return (Number(row.sell_rate || 0) + Number(row.admin_margin || 0)) || 0;
    return Number(row.buy_rate || 0) || 0;
  }
  if (typeof liveRates === 'object') {
    const row = liveRates[t] || liveRates[(t).toUpperCase()];
    if (!row) return 0;
    if (mode === 'sell') return (Number(row.sell_rate || 0) + Number(row.admin_margin || 0)) || 0;
    return Number(row.buy_rate || 0) || 0;
  }
  return 0;
}

function getMetalSellRate(metalType, liveRates) {
  return pickRateFromTable(metalType, liveRates, 'sell');
}

function getMetalBuyRate(metalType, liveRates) {
  return pickRateFromTable(metalType, liveRates, 'buy');
}

function getNetWeight(item) {
  const n = item?.net_wt ?? item?.weight ?? item?.netWt ?? item?.wt ?? item?.net_weight ?? item?.netWeight;
  return Number(n) || 0;
}

/** Excel / ERP wastage column — percentage added to net weight for billable metal weight. */
function parseWastagePercent(item) {
  if (!item || typeof item !== 'object') return null;
  const raw =
    item.wastage ??
    item.Wastage ??
    item['Wastage(%)'] ??
    item.wastage_pct ??
    item.wastagePct ??
    item.wastage_percent;
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace(/%/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function snapWastagePercent(pct) {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const rounded = Math.round(pct);
  if (Math.abs(pct - rounded) <= 0.05) return rounded;
  return Math.round(pct * 100) / 100;
}

function resolveWastagePercent(item) {
  const explicit = parseWastagePercent(item);
  if (explicit != null && explicit > 0) return snapWastagePercent(explicit);
  const net = getNetWeight(item);
  const gross = Number(item?.gross_weight ?? item?.grossWeight ?? 0) || 0;
  if (net > 0 && gross > net) return snapWastagePercent(Math.round((gross / net - 1) * 10000) / 100);
  return 0;
}

function getMetalBillableWeight(item) {
  const net = getNetWeight(item);
  const w = resolveWastagePercent(item);
  if (w > 0 && net > 0) return net * (1 + w / 100);
  const gross = Number(item?.gross_weight ?? item?.grossWeight ?? 0) || 0;
  if (gross > net && gross > 0) return gross;
  return net;
}

/** Gross / billable weight — display; metal calc uses full precision via getMetalBillableWeight. */
function getBillableWeight(item) {
  const net = getNetWeight(item);
  const bill = getMetalBillableWeight(item);
  if (bill > net) return Math.round(bill * 1000) / 1000;
  return net;
}

function goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, mcAmount, stoneAmount) {
  const mc = Number(mcAmount) || 0;
  const stone = Number(stoneAmount) || 0;
  if (mc === 0 && stone === 0 && wastagePct > 0) {
    return Math.round((netWt * metalRate * (100 + wastagePct) * (100 + gstPct)) / 10000);
  }
  const metalPart = Math.floor((netWt * metalRate * (100 + wastagePct)) / 100);
  return goldStorefrontTotal(metalPart + mc + stone, gstPct);
}

/** Gold storefront total — round to nearest rupee after GST (tag / manual billing). */
function goldStorefrontTotal(preGstBase, gstRatePct) {
  const gst = Number(gstRatePct) || 0;
  return Math.round(preGstBase * (1 + gst / 100));
}

function getPurity(item) {
  const p = item?.purity ?? item?.karat ?? item?.k;
  const v = Number(p);
  if (!v || v <= 0) return 0;
  if (v >= 100) return v / 10; // fineness e.g. 916 → 91.6 %
  if (v > 1) return v;
  return v * 100;
}

/** Match client `goldRatePerGramForItem` — 22K/18K rows when set, else 24K × factor. */
function goldRatePerGram(liveRates, item) {
  const row24 = pickRateFromTable('gold', liveRates, 'sell');
  const row22 = pickRateFromTable('gold_22k', liveRates, 'sell');
  const row18 = pickRateFromTable('gold_18k', liveRates, 'sell');
  const g24 = row24 > 0 ? row24 / 10 : 0;
  const g22 = row22 > 0 ? row22 / 10 : g24 > 0 ? g24 * 0.916 : 0;
  const g18 = row18 > 0 ? row18 / 10 : g24 > 0 ? g24 * 0.75 : 0;
  const purity = getPurity(item);
  if (purity >= 99 || purity >= 99.5) return g24;
  if ((purity >= 90 && purity <= 93) || Math.abs(purity - 91.6) < 1.5) return g22;
  if ((purity >= 74 && purity <= 76) || Math.abs(purity - 75) < 1.5) return g18;
  if (g24 > 0 && purity > 0) return g24 * (purity / 100);
  return g24 || g22 || g18;
}

function getMetalSellRatePerGram(metalType, liveRates, item) {
  const mt = String(metalType || 'gold').toLowerCase();
  if (mt.startsWith('silver')) {
    const row = pickRateFromTable('silver', liveRates, 'sell');
    return row > 0 ? row / 1000 : 0;
  }
  if (mt.startsWith('gold') && !mt.includes('diamond') && item) return goldRatePerGram(liveRates, item);
  const row = pickRateFromTable(mt.startsWith('gold') ? 'gold' : mt, liveRates, 'sell');
  return row > 0 ? row / 10 : 0;
}

function getMc(item) {
  const type = (item?.mc_type ?? item?.mcType ?? 'PER_GRAM').toUpperCase();
  const val = Number(item?.mc_rate ?? item?.mc_value ?? item?.mc) || 0;
  const netWt = getNetWeight(item);
  return type === 'FIXED' ? val : netWt * val;
}

function getStoneCharges(item) {
  return Number(item?.stone_charges ?? item?.stoneCharges ?? 0) || 0;
}

function calculateItemPrice(item, liveRates, gstRatePct) {
  const metalType = item?.metal_type ?? item?.metalType ?? 'gold';
  const netWt = getNetWeight(item);
  const billWt = getMetalBillableWeight(item);
  const purity = getPurity(item);
  const mt = String(metalType).toLowerCase();
  const isGold = mt.startsWith('gold') && !mt.includes('diamond');
  const isSilver = mt.startsWith('silver');
  const metalRate = getMetalSellRatePerGram(metalType, liveRates, item);
  const wastagePct = isGold ? resolveWastagePercent(item) : 0;
  let metalValue;
  if (isGold && metalRate > 0) {
    metalValue = Math.floor((netWt * metalRate * (100 + wastagePct)) / 100);
  } else if (isSilver && metalRate > 0) {
    const effPurity = purity >= 90 && purity <= 100 ? 100 : purity;
    metalValue = billWt * metalRate * (effPurity / 100);
  } else {
    metalValue = billWt * metalRate * (purity / 100);
  }
  const mcAmount = isGold ? Math.round(getMc(item)) : getMc(item);
  const stoneAmount = isGold ? Math.round(getStoneCharges(item)) : getStoneCharges(item);
  const taxable = metalValue + mcAmount + stoneAmount;
  const gstRate = Number(gstRatePct ?? item?.gst_rate) || 0;
  const cgst = gstRate ? taxable * (gstRate / 200) : 0;
  const sgst = gstRate ? taxable * (gstRate / 200) : 0;
  const totalGst = cgst + sgst;
  const netTotal = isGold && gstRate > 0
    ? (mcAmount === 0 && stoneAmount === 0 && wastagePct > 0
        ? goldTagFormulaTotal(netWt, metalRate, wastagePct, gstRate, 0, 0)
        : goldStorefrontTotal(taxable, gstRate))
    : taxable + totalGst;
  return {
    metalValue,
    mcAmount,
    stoneAmount,
    taxable,
    cgst,
    sgst,
    totalGst,
    netTotal
  };
}

function calculateBillTotals(items, liveRates, gstRatePct) {
  const result = {
    item_count: 0,
    taxable: 0,
    cgst: 0,
    sgst: 0,
    total_gst: 0,
    net_total: 0
  };
  const list = Array.isArray(items) ? items : [];
  for (const it of list) {
    const r = calculateItemPrice(it, liveRates, gstRatePct);
    result.item_count += 1;
    result.taxable += r.taxable;
    result.cgst += r.cgst;
    result.sgst += r.sgst;
    result.total_gst += r.totalGst;
    result.net_total += r.netTotal;
  }
  return {
    item_count: result.item_count,
    taxable: Math.round(result.taxable * 100) / 100,
    cgst: Math.round(result.cgst * 100) / 100,
    sgst: Math.round(result.sgst * 100) / 100,
    total_gst: Math.round(result.total_gst * 100) / 100,
    net_total: Math.round(result.net_total * 100) / 100
  };
}

function calculatePurchaseCost(item, liveRates) {
  const metalRate = getMetalBuyRate(item?.metal_type ?? item?.metalType, liveRates);
  const netWt = getNetWeight(item);
  const purity = getPurity(item);
  const metalValue = netWt * metalRate * (purity / 100);
  const mcAmount = getMc(item);
  return metalValue + mcAmount;
}

module.exports = {
  calculateItemPrice,
  calculateBillTotals,
  calculatePurchaseCost
};
