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
  const n = item?.net_wt ?? item?.weight ?? item?.netWt ?? item?.wt;
  return Number(n) || 0;
}

function getPurity(item) {
  const p = item?.purity ?? item?.karat ?? item?.k;
  const v = Number(p);
  if (!v || v <= 0) return 0;
  return v > 1 && v <= 100 ? v : v * 100;
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
  const metalRate = getMetalSellRate(item?.metal_type ?? item?.metalType, liveRates);
  const netWt = getNetWeight(item);
  const purity = getPurity(item);
  const metalValue = netWt * metalRate * (purity / 100);
  const mcAmount = getMc(item);
  const stoneAmount = getStoneCharges(item);
  const taxable = metalValue + mcAmount + stoneAmount;
  const gstRate = Number(gstRatePct ?? item?.gst_rate) || 0;
  const cgst = gstRate ? taxable * (gstRate / 200) : 0;
  const sgst = gstRate ? taxable * (gstRate / 200) : 0;
  const totalGst = cgst + sgst;
  const netTotal = taxable + totalGst;
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
