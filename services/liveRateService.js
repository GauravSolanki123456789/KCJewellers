// ============================================
// LIVE RATE SERVICE - Yahoo Finance Data Feed
// Gaurav Softwares - Jewelry Estimation
// ============================================

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { query } = require('../config/database');

const CACHE_TTL_MS = 60 * 1000; // 60 seconds (Yahoo Finance can handle high frequency)
const TROY_OZ_GRAMS = 31.1034768;

// CRITICAL: Realistic ranges for Indian gold/silver (per 10g gold, per 1kg silver)
const GOLD_10G_MIN = 60000;
const GOLD_10G_MAX = 900000;
const SILVER_1KG_MIN = 80000;
const SILVER_1KG_MAX = 500000;

// 2026 Chennai fallback when API rate limits or fails
const FALLBACK_RATES = {
  gold24k_10g: 162880,
  gold22k_10g: 149310,
  gold18k_10g: 122160,
  silver_1kg: 285000
};

const GOLD_COIN_PREMIUM_PER_G = 500;

// Chennai Market Premium (Import duty + local margins) to match local rates
const GOLD_PREMIUM_MULTIPLIER = 1.15;  // ~15% duty/premium
const SILVER_PREMIUM_MULTIPLIER = 1.12; // ~12% duty/premium

// Yahoo Finance symbols
const GOLD_SYMBOL = 'GC=F';   // Gold futures USD/oz
const SILVER_SYMBOL = 'SI=F'; // Silver futures USD/oz
const INR_SYMBOL = 'INR=X';   // USD to INR

let lastExternal = { gold: 0, silver: 0, platinum: 0 };
let timer = null;
let lastPayload = null;
let memCache = { ts: 0, data: null, source: null };

function safeNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/**
 * CRITICAL VALIDATION: Reject dangerous rates outside realistic range.
 */
function validateRates(gold24k_10g, silver_1kg) {
  const gold = safeNum(gold24k_10g);
  const silver = safeNum(silver_1kg);

  if (gold < GOLD_10G_MIN || gold > GOLD_10G_MAX) {
    throw new Error(
      `INVALID_GOLD_RATE: ${gold} is outside safe range [${GOLD_10G_MIN}-${GOLD_10G_MAX}]. Rejecting.`
    );
  }
  if (silver > 0 && (silver < SILVER_1KG_MIN || silver > SILVER_1KG_MAX)) {
    throw new Error(
      `INVALID_SILVER_RATE: ${silver} is outside safe range [${SILVER_1KG_MIN}-${SILVER_1KG_MAX}]. Rejecting.`
    );
  }
}

/**
 * Build the API response object from base gold rate (24k per 10g) and silver (per 1kg)
 */
function buildRatesObject(gold24k_10g, silver_1kg) {
  const gold = Math.round(safeNum(gold24k_10g));
  const silver = Math.round(safeNum(silver_1kg) || FALLBACK_RATES.silver_1kg);

  return {
    gold24k_10g: gold,
    gold22k_10g: Math.round(gold * 0.916),   // 22k = 91.6% purity
    gold18k_10g: Math.round(gold * 0.750),   // 18k = 75% purity
    silver_1kg: silver,
    gold_coin_1g: Math.round(gold / 10 + GOLD_COIN_PREMIUM_PER_G)
  };
}

/**
 * Fetch live rates from Yahoo Finance (global futures + USD/INR)
 */
async function fetchLiveRates() {
  const now = Date.now();
  if (memCache.data && (now - memCache.ts) < CACHE_TTL_MS) {
    return {
      success: true,
      rates: memCache.data,
      source: memCache.source,
      timestamp: memCache.timestamp
    };
  }

  try {
    // Fetch all symbols concurrently
    const [goldData, silverData, inrData] = await Promise.all([
      yahooFinance.quote(GOLD_SYMBOL),
      yahooFinance.quote(SILVER_SYMBOL),
      yahooFinance.quote(INR_SYMBOL)
    ]);

    const goldUsd = safeNum(goldData?.regularMarketPrice || goldData?.regularMarketClose);
    const silverUsd = safeNum(silverData?.regularMarketPrice || silverData?.regularMarketClose);
    const usdToInr = safeNum(inrData?.regularMarketPrice || inrData?.regularMarketClose);

    if (!goldUsd || !silverUsd || !usdToInr) {
      throw new Error('Missing price data from Yahoo Finance');
    }

    // Convert to Indian Spot Rates (1 Troy Oz = 31.1034768 grams)
    const rawGold10g = (goldUsd / TROY_OZ_GRAMS) * 10 * usdToInr;
    const rawSilver1kg = (silverUsd / TROY_OZ_GRAMS) * 1000 * usdToInr;

    // Apply Chennai Market Premium (duty + local margins)
    const finalGold24k = rawGold10g * GOLD_PREMIUM_MULTIPLIER;
    const finalSilver = rawSilver1kg * SILVER_PREMIUM_MULTIPLIER;

    validateRates(finalGold24k, finalSilver);

    const rates = {
      gold24k_10g: Math.round(finalGold24k),
      gold22k_10g: Math.round(finalGold24k * 0.916),
      gold18k_10g: Math.round(finalGold24k * 0.750),
      silver_1kg: Math.round(finalSilver)
    };

    const timestamp = Date.now();
    memCache = { ts: now, data: rates, source: 'live_market', timestamp };

    console.log(`liveRateService: Yahoo Finance gold24=${rates.gold24k_10g}, silver=${rates.silver_1kg} (source: live_market)`);

    return {
      success: true,
      rates,
      source: 'live_market',
      timestamp
    };
  } catch (err) {
    console.error('liveRateService Yahoo Finance failed:', err.message);
    // Fallback to 2026 Chennai rates
    const rates = { ...FALLBACK_RATES };
    const timestamp = Date.now();
    memCache = { ts: now, data: rates, source: 'estimated', timestamp };
    console.warn('liveRateService: Using fallback (source: estimated).');
    return {
      success: true,
      rates,
      source: 'estimated',
      timestamp
    };
  }
}

function bounds() {
  return {
    GOLD_MIN: GOLD_10G_MIN,
    GOLD_MAX: GOLD_10G_MAX,
    SILVER_MIN: SILVER_1KG_MIN,
    SILVER_MAX: SILVER_1KG_MAX
  };
}

function clamp(v, min, max) {
  v = safeNum(v);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

async function fetchExternalRates() {
  const result = await fetchLiveRates();
  const r = result.rates || {};
  let gold24 = safeNum(r.gold24k_10g);
  let gold22 = safeNum(r.gold22k_10g) || Math.round(gold24 * 0.916);
  let silver = safeNum(r.silver_1kg);
  const { GOLD_MIN, GOLD_MAX, SILVER_MIN, SILVER_MAX } = bounds();
  gold24 = clamp(gold24, GOLD_MIN, GOLD_MAX);
  gold22 = clamp(gold22, GOLD_MIN * 0.85, GOLD_MAX);
  silver = clamp(silver, SILVER_MIN, SILVER_MAX);
  return { gold24, gold22, silver, mcxGold: 0, mcxSilver: 0 };
}

async function getMargins() {
  try {
    const rows = await query('SELECT metal_type, admin_margin FROM live_rates');
    const m = {};
    for (const r of rows) {
      const k = (r.metal_type || '').toLowerCase();
      m[k] = Number(r.admin_margin || 0);
    }
    return m;
  } catch {
    return { gold: 0, silver: 0, platinum: 0 };
  }
}

async function upsertRate(metal, buy, sell, margin) {
  let m = (metal || '').toLowerCase();
  if (m === 'gold_22k' || m === 'gold_mcx') m = 'gold';
  if (m === 'silver_mcx') m = 'silver';
  const rows = await query(`
    INSERT INTO live_rates (metal_type, buy_rate, sell_rate, admin_margin, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (metal_type) DO UPDATE SET
      buy_rate = EXCLUDED.buy_rate,
      sell_rate = EXCLUDED.sell_rate,
      admin_margin = EXCLUDED.admin_margin,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [m, buy, sell, margin]);
  return rows[0];
}

function buildPayload(external, margins) {
  const { GOLD_MIN, GOLD_MAX, SILVER_MIN, SILVER_MAX } = bounds();
  const goldDisplay = clamp(safeNum(external.gold24) + safeNum(margins.gold), GOLD_MIN, GOLD_MAX);
  const gold22Display = clamp(Math.round(safeNum(external.gold22) + safeNum(margins.gold)), GOLD_MIN * 0.85, GOLD_MAX);
  const silverDisplay = clamp(safeNum(external.silver) + safeNum(margins.silver), SILVER_MIN, SILVER_MAX);
  const platinumDisplay = Math.max(0, safeNum(external.platinum) + safeNum(margins.platinum));
  const goldMCXDisplay = clamp(safeNum(external.mcxGold) + safeNum(margins.gold), GOLD_MIN, GOLD_MAX);
  const silverMCXDisplay = clamp(safeNum(external.mcxSilver) + safeNum(margins.silver), SILVER_MIN, SILVER_MAX);
  return {
    ts: Date.now(),
    rates: [
      { metal_type: 'gold', buy_rate: clamp(safeNum(external.gold24), GOLD_MIN, GOLD_MAX), admin_margin: safeNum(margins.gold), display_rate: goldDisplay },
      { metal_type: 'gold_22k', buy_rate: clamp(safeNum(external.gold22) || Math.round((safeNum(external.gold24) * 22) / 24), GOLD_MIN * 0.85, GOLD_MAX), admin_margin: safeNum(margins.gold), display_rate: gold22Display },
      { metal_type: 'silver', buy_rate: clamp(safeNum(external.silver), SILVER_MIN, SILVER_MAX), admin_margin: safeNum(margins.silver), display_rate: silverDisplay },
      ...(external.mcxGold ? [{ metal_type: 'gold_mcx', buy_rate: clamp(safeNum(external.mcxGold), GOLD_MIN, GOLD_MAX), admin_margin: safeNum(margins.gold), display_rate: goldMCXDisplay }] : []),
      ...(external.mcxSilver ? [{ metal_type: 'silver_mcx', buy_rate: clamp(safeNum(external.mcxSilver), SILVER_MIN, SILVER_MAX), admin_margin: safeNum(margins.silver), display_rate: silverMCXDisplay }] : []),
      { metal_type: 'platinum', buy_rate: Math.max(0, safeNum(external.platinum)), admin_margin: safeNum(margins.platinum), display_rate: platinumDisplay }
    ]
  };
}

async function tick(io) {
  try {
    const external = await fetchExternalRates();
    lastExternal = { gold: external.gold24, silver: external.silver, platinum: 0 };
    const margins = await getMargins();
    const payload = buildPayload(external, margins);
    lastPayload = payload;
    for (const r of payload.rates) {
      if (r.metal_type === 'gold_22k') continue;
      if (String(r.metal_type || '').includes('_mcx')) continue;
      await upsertRate(r.metal_type, r.buy_rate, r.display_rate, r.admin_margin);
    }
    io.to('main').emit('live-rate', payload);
    io.to('main').emit('rate_update', payload);
    io.emit('live-rate', payload);
    io.emit('rate_update', payload);
  } catch (err) {
    console.error('liveRateService tick error:', err.message);
  }
}

function start(io) {
  if (timer) return;
  tick(io).catch(() => {});
  timer = setInterval(() => tick(io).catch(() => {}), 60 * 1000); // 60 seconds
}

async function setMargin(metal, margin, io) {
  const m = (metal || '').toLowerCase();
  const ext = lastExternal;
  const buy = Number(ext[m] || (m === 'gold_22k' ? ext.gold : 0) || 0);
  const sell = buy + Number(margin || 0);
  const row = await upsertRate(m, buy, sell, Number(margin || 0));
  const payload = buildPayload(
    { gold24: ext.gold, gold22: Math.round(Number(ext.gold || 0) * 0.916), silver: ext.silver, platinum: ext.platinum },
    await getMargins()
  );
  lastPayload = payload;
  io.to('main').emit('live-rate', payload);
  io.to('main').emit('rate_update', payload);
  io.emit('live-rate', payload);
  io.emit('rate_update', payload);
  return row;
}

async function getCurrentPayload() {
  const margins = await getMargins();
  return buildPayload(
    { gold24: lastExternal.gold, gold22: Math.round((Number(lastExternal.gold || 0) * 0.916)), silver: lastExternal.silver, platinum: lastExternal.platinum },
    margins
  );
}

module.exports = {
  fetchLiveRates,
  start,
  setMargin,
  getCurrentPayload
};
