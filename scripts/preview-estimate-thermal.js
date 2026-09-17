#!/usr/bin/env node
/**
 * Preview Marlecha Epson estimate text (no printer).
 *
 * Examples:
 *   node scripts/preview-estimate-thermal.js --sample silver
 *   node scripts/preview-estimate-thermal.js --sample gift
 *   node scripts/preview-estimate-thermal.js --json path/to/bill.json
 */
const fs = require('fs');
const path = require('path');
const erpPrint = require('./erp-print-templates');

function parseArgs(argv) {
    const out = { sample: 'silver', json: null };
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

function buildSampleBill(kind) {
    const base = erpPrint.buildSampleBillForPreview(kind === 'gift' ? 'estimate_gold' : 'estimate_silver');
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
    return {
        ...base,
        lines: [
            {
                barcode: 'silver-gift-ganesh-stand',
                name: 'GANESH ROSEWOOD AGARBATTI STAND',
                style_code: 'GIFT ITEMS',
                invoice_item_name: 'SILVER JEWELLERY',
                metal_type: 'silver',
                weightGm: 3.75,
                qty: 2,
                purity: 925,
                wastage_pct: 10,
                mc_rate: 600,
                mc_type: 'MC/PC',
                mc_rate_slab_r: 450,
                ratePerGram: 245,
                lineTotalInr: 3008,
            },
        ],
        session: {
            rateSlab: 'R',
            goldPerG: 15750,
            silverPerG: 250,
        },
    };
}

const args = parseArgs(process.argv);
if (args.help) {
    console.log(`Usage:
  node scripts/preview-estimate-thermal.js --sample silver|gift
  node scripts/preview-estimate-thermal.js --json ./bill-export.json

JSON shape: { bill_number, customer_name, lines[], session?, total_inr? }
Rates default to session silverPerG / goldPerG when present.`);
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
