/**
 * Slab R + MC/PC sanity check — ROSEWOOD KAPOOR AARTI (8 g, 7% wastage, MC/PC ₹750, silver ₹245/g).
 * Run: node scripts/test-slab-r-mc-pc.mjs
 */
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { isMcPerPieceType } = require('../services/mcTypeUtils.js')
const { calculateItemPrice } = require('../services/pricingService.js')

const rates245 = [
  { metal_type: 'silver', sell_rate: 245000, display_rate: 245000 },
]
const rates270 = [
  { metal_type: 'silver', sell_rate: 270000, display_rate: 270000 },
]

const item = {
  metal_type: 'silver',
  net_weight: 8,
  wastage_pct: 7,
  purity: 925,
  mc_rate: 750,
  mc_type: 'MC/PC',
}

function slabRServer(item, rates, mcDiscPct, silverOffset) {
  const row = rates.find((r) => r.metal_type === 'silver')
  const livePerG = Number(row.display_rate) / 1000
  const slabPerG = Math.max(0, livePerG - silverOffset)
  const billWt = 8 * 1.07
  const metal = billWt * slabPerG
  const mc = isMcPerPieceType(item.mc_type) ? 750 * (1 - mcDiscPct / 100) : billWt * 750 * (1 - mcDiscPct / 100)
  return Math.round((metal + mc) * 1.03)
}

const retail245 = Math.round(calculateItemPrice(item, rates245, 3).netTotal)
const retail270 = Math.round(calculateItemPrice(item, rates270, 3).netTotal)
const slab245 = slabRServer(item, rates245, 25, 5)

console.log('MC/PC per piece:', isMcPerPieceType('MC/PC'))
console.log('Retail @ ₹245/g:', retail245, '(expect ~2933)')
console.log('Retail @ ₹270/g (stale creator row):', retail270, '(was wrongly used as compare-at ~3153)')
console.log('Slab R @ ₹245−5/g, MC 25% off:', slab245, '(expect ~2695)')

const okRetail = Math.abs(retail245 - 2933) <= 2
const okSlab = Math.abs(slab245 - 2695) <= 2
if (!okRetail || !okSlab) {
  console.error('FAIL')
  process.exit(1)
}
console.log('OK')
