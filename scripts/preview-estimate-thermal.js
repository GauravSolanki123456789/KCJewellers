#!/usr/bin/env node
/**
 * Preview Marlecha Epson estimate text (no printer).
 *
 * Examples:
 *   node scripts/preview-estimate-thermal.js --sample chombu
 *   node scripts/preview-estimate-thermal.js --sample acrylic
 *   node scripts/preview-estimate-thermal.js --sample gift
 *   node scripts/preview-estimate-thermal.js --json path/to/bill.json
 */
const fs = require('fs');
const path = require('path');
const erpPrint = require('./erp-print-templates');

function parseArgs(argv) {
    const out = { sample: 'chombu', json: null };
    for (let i = 2; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--sample' && argv[i + 1]) {
            out.sample = String(argv[++i]).toLowerCase();
        } else if (a === '--json' && argv[i + 1]) {
            out.json = String(argv[++i]);
        } else if (a === '--help' || a === '-h') {
            out.help = true;
        }
    }
    return out;
}

const DISPLAY_RATES_255 = [
    { metal_type: 'gold', display_rate: 157500 },
    { metal_type: 'gold_22k', display_rate: 144270 },
    { metal_type: 'gold_18k', display_rate: 118125 },
    { metal_type: 'silver', display_rate: 255000 },
];

function buildSampleBill(kind) {
    const base = erpPrint.buildSampleBillForPreview('estimate_silver');
    if (kind === 'gift') {
        return {
            ...base,
            lines: [
                {
                    barcode: 'IDOLS-PADAM',
                    name: 'PADAM',
                    style_code: 'SILVER PLATED',
                    invoice_item_name: 'GIFT ITEMS',
                    metal_type: 'silver',
                    qty: 1,
                    mrpMode: true,
                    mrpListPrice: 900,
                    unitInr: 675,
                    fixed_price: 675,
                    lineTotalInr: 675,
                },
            ],
        };
    }
    if (kind === 'acrylic') {
        return {
            ...base,
            bill_number: 'EST-ACRYLIC',
            total_inr: 1004,
            session: {
                rateSlab: 'R',
                goldPerG: 15750,
                silverPerG: 250,
                displayRates: DISPLAY_RATES_255,
            },
            lines: [
                {
                    barcode: '915459',
                    name: 'ACRYLIC LINGAM',
                    style_code: 'SILVER GIFT',
                    metal_type: 'silver',
                    weightGm: 2,
                    qty: 1,
                    wastage_pct: 5,
                    mc_rate: 600,
                    mc_type: 'MC/PC',
                    mc_rate_slab_r: 450,
                    displayMcBeforeDiscount: 600,
                    displayMcInr: 450,
                    ratePerGram: 250,
                    lineTotalInr: 1004,
                },
            ],
        };
    }
    if (kind === 'chombu' || kind === 'silver') {
        return {
            ...base,
            bill_number: 'EST-CHOMBU',
            total_inr: 28325,
            session: {
                rateSlab: 'R',
                goldPerG: 15750,
                silverPerG: 250,
                displayRates: DISPLAY_RATES_255,
            },
            lines: [
                {
                    barcode: 'CHO-89219',
                    name: 'CHO',
                    style_code: 'PLAIN CHOMBU',
                    product_name: 'CHOMBU',
                    metal_type: 'SILVER',
                    weightGm: 110,
                    purity: 80,
                    mc_rate: 4,
                    mc_rate_slab_r: 0,
                    mc_type: 'MC/GM',
                    ratePerGram: 250,
                    lineTotalInr: 28325,
                    qty: 1,
                },
            ],
        };
    }
    return base;
}

const args = parseArgs(process.argv);
if (args.help) {
    console.log(`Usage:
  node scripts/preview-estimate-thermal.js --sample chombu|acrylic|gift|silver
  node scripts/preview-estimate-thermal.js --json ./bill-export.json

JSON shape: { bill_number, customer_name, lines[], session?, total_inr? }
Session displayRates silver display_rate is per kg (255000 = ₹255/g).`);
    process.exit(0);
}

let bill;
if (args.json) {
    const abs = path.resolve(args.json);
    bill = JSON.parse(fs.readFileSync(abs, 'utf8'));
} else {
    bill = buildSampleBill(args.sample);
}

const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
const rates = {
    gold: session.goldPerG ?? session.gold_per_g ?? 15750,
    silver: session.silverPerG ?? session.silver_per_g ?? 250,
};

const text = erpPrint.buildRoughEstimateBody(bill, {}, rates);
process.stdout.write(`${text}\n`);
