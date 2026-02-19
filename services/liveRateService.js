const { query } = require('../config/database');
const { getRates } = require('./bullionScraper');

let lastExternal = { gold: 0, silver: 0, platinum: 0 };
let timer = null;
let lastPayload = null;

function safeNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function clamp(v, min, max) {
  v = safeNum(v);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function bounds() {
  const GOLD_MIN = safeNum(process.env.GOLD_MIN_RATE || 1500);
  const GOLD_MAX = safeNum(process.env.GOLD_MAX_RATE || 15000);
  const SILVER_MIN = safeNum(process.env.SILVER_MIN_RATE || 10);
  const SILVER_MAX = safeNum(process.env.SILVER_MAX_RATE || 400);
  return { GOLD_MIN, GOLD_MAX, SILVER_MIN, SILVER_MAX };
}

async function fetchExternalRates() {
  const fb = async () => {
    const rows = await query('SELECT metal_type, sell_rate FROM live_rates');
    const map = {};
    for (const r of rows) {
      map[(r.metal_type || '').toLowerCase()] = Number(r.sell_rate || 0);
    }
    const gold = map.gold || Number(process.env.DEV_GOLD_RATE || 7500);
    const silver = map.silver || Number(process.env.DEV_SILVER_RATE || 90);
    return { gold24: gold, gold22: Math.round((gold * 22) / 24), silver };
  };
  const data = await getRates(fb);
  let gold24 = Number(data.gold24 || data.gold || 0);
  let gold22 = Number(data.gold22 || Math.round((gold24 * 22) / 24));
  let silver = Number(data.silver || 0);
  let mcxGold = Number(data.mcxGold || 0);
  let mcxSilver = Number(data.mcxSilver || 0);
  // Normalize to per-gram if upstream uses 10g/100g/kg
  if (gold24 > 100000) gold24 = Math.round(gold24 / 100); else if (gold24 > 20000) gold24 = Math.round(gold24 / 10);
  if (gold22 > 100000) gold22 = Math.round(gold22 / 100); else if (gold22 > 20000) gold22 = Math.round(gold22 / 10);
  if (silver > 100000) silver = Math.round(silver / 100); else if (silver > 2000) silver = Math.round(silver / 10);
  if (mcxGold > 100000) mcxGold = Math.round(mcxGold / 100); else if (mcxGold > 20000) mcxGold = Math.round(mcxGold / 10);
  if (mcxSilver > 100000) mcxSilver = Math.round(mcxSilver / 100); else if (mcxSilver > 2000) mcxSilver = Math.round(mcxSilver / 10);
  const { GOLD_MIN, GOLD_MAX, SILVER_MIN, SILVER_MAX } = bounds();
  gold24 = clamp(gold24, GOLD_MIN, GOLD_MAX);
  gold22 = clamp(gold22, GOLD_MIN * 0.85, GOLD_MAX); // conservative
  silver = clamp(silver, SILVER_MIN, SILVER_MAX);
  mcxGold = clamp(mcxGold, GOLD_MIN, GOLD_MAX);
  mcxSilver = clamp(mcxSilver, SILVER_MIN, SILVER_MAX);
  return { gold24, gold22, silver, mcxGold, mcxSilver };
}

async function getMargins() {
  const rows = await query('SELECT metal_type, admin_margin FROM live_rates');
  const m = {};
  for (const r of rows) {
    const k = (r.metal_type || '').toLowerCase();
    m[k] = Number(r.admin_margin || 0);
  }
  return m;
}

async function upsertRate(metal, buy, sell, margin) {
  const rows = await query(`
    INSERT INTO live_rates (metal_type, buy_rate, sell_rate, admin_margin, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (metal_type) DO UPDATE SET
      buy_rate = EXCLUDED.buy_rate,
      sell_rate = EXCLUDED.sell_rate,
      admin_margin = EXCLUDED.admin_margin,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [metal, buy, sell, margin]);
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
}

function start(io) {
  if (timer) return;
  tick(io).catch(() => {});
  timer = setInterval(() => tick(io).catch(() => {}), 30000);
}

async function setMargin(metal, margin, io) {
  const m = (metal || '').toLowerCase();
  const ext = lastExternal;
  const buy = Number(ext[m] || 0);
  const sell = buy + Number(margin || 0);
  const row = await upsertRate(m, buy, sell, Number(margin || 0));
  const payload = buildPayload(ext, await getMargins());
  lastPayload = payload;
  io.to('main').emit('live-rate', payload);
  io.to('main').emit('rate_update', payload);
  io.emit('live-rate', payload);
  io.emit('rate_update', payload);
  return row;
}

async function getCurrentPayload() {
  const margins = await getMargins();
  return buildPayload({ gold24: lastExternal.gold, gold22: Math.round((Number(lastExternal.gold || 0) * 22) / 24), silver: lastExternal.silver, platinum: lastExternal.platinum }, margins);
}

module.exports = {
  start,
  setMargin,
  getCurrentPayload
};
