/**
 * ERP print templates — TSC PRN labels & Epson receipt bills.
 */

const DEFAULT_LABEL_PRN_SILVER = `
SIZE 92.5 mm, 15 mm
GAP 3 mm, 0 mm
DIRECTION 0,0
REFERENCE 0,0
OFFSET 0 mm
SET PEEL OFF
SET CUTTER OFF
SET PARTIAL_CUTTER OFF
SET TEAR ON
CLS
CODEPAGE 1252
TEXT 738,101,"ROMAN.TTF",180,1,8,"{{product_name}}"
TEXT 738,77,"ROMAN.TTF",180,1,8,"GWT:"
TEXT 666,77,"ROMAN.TTF",180,1,9,"{{gross_weight}}"
TEXT 738,53,"ROMAN.TTF",180,1,8,"NWT:"
TEXT 666,53,"ROMAN.TTF",180,1,9,"{{net_weight}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
TEXT 738,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim();

const DEFAULT_LABEL_PRN_GOLD = `
SIZE 92.5 mm, 15 mm
GAP 3 mm, 0 mm
DIRECTION 0,0
REFERENCE 0,0
OFFSET 0 mm
SET PEEL OFF
SET CUTTER OFF
SET PARTIAL_CUTTER OFF
SET
SET TEAR ON
CLS
CODEPAGE 1252
TEXT 720,101,"ROMAN.TTF",180,1,8,"{{product_name}}"
TEXT 720,77,"ROMAN.TTF",180,1,8,"NWT:"
TEXT 648,77,"ROMAN.TTF",180,1,9,"{{net_weight}}"
TEXT 720,53,"ROMAN.TTF",180,1,8,"GWT:"
TEXT 648,53,"ROMAN.TTF",180,1,9,"{{gross_weight}}"
TEXT 720,29,"ROMAN.TTF",180,1,8,"MC:"
TEXT 648,29,"ROMAN.TTF",180,1,9,"{{mc_rate}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
TEXT 720,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim();

const DEFAULT_LABEL_PRN_SILVER_EXTRAS = `
SIZE 92.5 mm, 15 mm
GAP 3 mm, 0 mm
DIRECTION 0,0
REFERENCE 0,0
OFFSET 0 mm
SET PEEL OFF
SET CUTTER OFF
SET PARTIAL_CUTTER OFF
SET TEAR ON
CLS
CODEPAGE 1252
TEXT 738,101,"ROMAN.TTF",180,1,8,"{{product_name}}"
TEXT 738,77,"ROMAN.TTF",180,1,8,"GWT:"
TEXT 666,77,"ROMAN.TTF",180,1,9,"{{gross_weight}}"
TEXT 738,53,"ROMAN.TTF",180,1,8,"NWT:"
TEXT 666,53,"ROMAN.TTF",180,1,9,"{{net_weight}}"
TEXT 738,29,"ROMAN.TTF",180,1,8,"V.A:"
TEXT 666,29,"ROMAN.TTF",180,1,9,"{{wastage_pct}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
TEXT 738,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim();

/** Legacy alias — silver standard layout. */
const DEFAULT_LABEL_PRN = DEFAULT_LABEL_PRN_SILVER;

const DEFAULT_LABEL_PRN_MRP = `
SIZE 92.5 mm, 15 mm
GAP 3 mm, 0 mm
DIRECTION 0,0
REFERENCE 0,0
OFFSET 0 mm
SET PEEL OFF
SET CUTTER OFF
SET PARTIAL_CUTTER OFF
SET TEAR ON
CLS
CODEPAGE 1252
TEXT 738,101,"ROMAN.TTF",180,1,8,"{{product_name}}"
TEXT 738,77,"ROMAN.TTF",180,1,8,"MRP:"
TEXT 666,77,"ROMAN.TTF",180,1,9,"{{fixed_price}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim();

const LABEL_RULE_FIELD_KEYS = [
    'gross_weight',
    'bag_wt',
    'stone_charges',
    'stone_wt',
    'wastage_pct',
    'mc_rate',
    'bags',
    'box_charges',
    'box_code',
    'box_name',
    'fixed_price',
    'rfid_tag',
    'pcs_gt_1',
];

function newRuleId() {
    return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildDefaultLabelPrnRules(fallbackTemplate) {
    const silverFallback = normalizePrnTemplate(fallbackTemplate || DEFAULT_LABEL_PRN_SILVER);
    return [
        {
            id: 'mrp-only',
            name: 'MRP / fixed price (no weight)',
            enabled: true,
            priority: 40,
            metalTypes: [],
            requireAny: ['fixed_price'],
            requireAll: [],
            requireNone: ['gross_weight', 'avg_weight'],
            template: DEFAULT_LABEL_PRN_MRP,
        },
        {
            id: 'silver-extras',
            name: 'Silver · gross / bag / stone',
            enabled: true,
            priority: 30,
            metalTypes: ['SILVER'],
            requireAny: ['gross_weight', 'bag_wt', 'stone_charges'],
            requireAll: [],
            requireNone: [],
            template: DEFAULT_LABEL_PRN_SILVER_EXTRAS,
        },
        {
            id: 'gold',
            name: 'Gold',
            enabled: true,
            priority: 20,
            metalTypes: ['GOLD'],
            requireAny: [],
            requireAll: [],
            requireNone: [],
            template: DEFAULT_LABEL_PRN_GOLD,
        },
        {
            id: 'silver-standard',
            name: 'Silver · standard',
            enabled: true,
            priority: 10,
            metalTypes: ['SILVER'],
            requireAny: [],
            requireAll: [],
            requireNone: [],
            template: silverFallback,
        },
    ];
}

function normalizeMetalType(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

function metalTypeMatches(piece, metalTypes) {
    if (!Array.isArray(metalTypes) || !metalTypes.length) return true;
    const m = normalizeMetalType(piece?.metal_type);
    if (!m) return false;
    return metalTypes.some((t) => {
        const T = normalizeMetalType(t);
        if (!T) return false;
        if (m === T) return true;
        if (m.includes(T) || T.includes(m)) return true;
        if (T === 'GOLD' && m.includes('GOLD')) return true;
        if (T === 'SILVER' && m.includes('SILVER')) return true;
        return false;
    });
}

function pieceFieldHasValue(piece, field) {
    if (!piece || !field) return false;
    if (field === 'pcs_gt_1') {
        return (Number(piece.pcs) || 1) > 1;
    }
    if (field === 'rfid_tag') {
        const tag = piece.rfid_tag ?? piece.tag_no;
        return tag != null && String(tag).trim().length > 0;
    }
    const v = piece[field];
    if (v == null || v === '') return false;
    if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
    const s = String(v).trim();
    if (!s) return false;
    const n = Number(s);
    if (Number.isFinite(n) && n === 0) return false;
    return true;
}

function ruleMatchesPiece(piece, rule) {
    if (!rule || rule.enabled === false) return false;
    if (!metalTypeMatches(piece, rule.metalTypes)) return false;
    for (const f of rule.requireAll || []) {
        if (!pieceFieldHasValue(piece, f)) return false;
    }
    const any = rule.requireAny || [];
    if (any.length && !any.some((f) => pieceFieldHasValue(piece, f))) return false;
    for (const f of rule.requireNone || []) {
        if (pieceFieldHasValue(piece, f)) return false;
    }
    return true;
}

function migrateLabelPrnRules(printFormats) {
    const pf = printFormats || {};
    const raw = pf.labelPrnRules;
    if (!Array.isArray(raw) || !raw.length) return [];
    return raw
        .map((rule) => ({
            id: String(rule.id || newRuleId()),
            name: String(rule.name || 'Label rule').trim() || 'Label rule',
            enabled: rule.enabled !== false,
            priority: Number(rule.priority) || 0,
            metalTypes: Array.isArray(rule.metalTypes)
                ? rule.metalTypes.map((t) => String(t).trim()).filter(Boolean)
                : [],
            requireAny: Array.isArray(rule.requireAny)
                ? rule.requireAny.map((f) => String(f).trim()).filter(Boolean)
                : [],
            requireAll: Array.isArray(rule.requireAll)
                ? rule.requireAll.map((f) => String(f).trim()).filter(Boolean)
                : [],
            requireNone: Array.isArray(rule.requireNone)
                ? rule.requireNone.map((f) => String(f).trim()).filter(Boolean)
                : [],
            template: normalizePrnTemplate(rule.template || pf.labelPrnTemplate || DEFAULT_LABEL_PRN),
        }))
        .map((rule) => {
            const namedPcs = /pcs\s*greater\s*than\s*1/i.test(rule.name);
            const requireAll = [...(rule.requireAll || [])];
            if (namedPcs && !requireAll.includes('pcs_gt_1')) requireAll.push('pcs_gt_1');
            let template = rule.template;
            if (!/\{\{\s*pcs/i.test(template)) {
                template = template.replace(
                    /TEXT 738,21,"ROMAN\.TTF",180,1,8,""/,
                    'TEXT 738,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"',
                );
                template = template.replace(
                    /TEXT 720,21,"ROMAN\.TTF",180,1,8,""/,
                    'TEXT 720,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"',
                );
                if (namedPcs && !/\{\{\s*pcs/i.test(template)) {
                    template = template.replace(
                        /PRINT 1,1\s*$/m,
                        'TEXT 400,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"\nPRINT 1,1',
                    );
                }
            }
            return { ...rule, requireAll, template };
        })
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

function resolveLabelPrnTemplate(piece, printFormats) {
    const pf = printFormats || {};
    const rules = migrateLabelPrnRules(pf);
    for (const rule of rules) {
        if (ruleMatchesPiece(piece, rule)) {
            return {
                template: normalizePrnTemplate(rule.template || pf.labelPrnTemplate || DEFAULT_LABEL_PRN),
                ruleId: rule.id,
                ruleName: rule.name,
            };
        }
    }
    return {
        template: normalizePrnTemplate(pf.labelPrnTemplate || DEFAULT_LABEL_PRN),
        ruleId: null,
        ruleName: 'Default',
    };
}

const DEFAULT_BILL_TEMPLATE = `
================================
{{shop_name}}
{{shop_address}}
Ph: {{shop_phone}}
GSTIN: {{shop_gstin}}
================================
TAX INVOICE
Bill: {{bill_number}}
Date: {{bill_date}}
Slab: {{rate_slab}}
--------------------------------
Customer: {{customer_name}}
Mobile: {{customer_mobile}}
GSTIN: {{customer_gst}}
--------------------------------
{{lines_table}}
--------------------------------
Items: {{item_count}}
Gold rate: Rs.{{gold_rate}}/g
Silver rate: Rs.{{silver_rate}}/g
--------------------------------
TOTAL: Rs. {{total}}
MC discount: Rs. {{mc_discount}}
Cash discount: Rs. {{cash_discount}}
Total discount: Rs. {{total_discount}}
Collected: Rs. {{collected_amount}}
Advance: Rs. {{advance_paid}}
Balance: Rs. {{balance}}
================================
Thank you — visit again!
`.trim();

const DEFAULT_ESTIMATE_TEMPLATE_GOLD = `
================================
{{shop_name}}
{{shop_address}}
Ph: {{shop_phone}}
GSTIN: {{shop_gstin}}
================================
GOLD ESTIMATE
Estimate: {{bill_number}}
Date: {{bill_date}}
Slab: {{rate_slab}}

--------------------------------
Customer: {{customer_name}}
Mobile: {{customer_mobile}}
Address: {{customer_address}}
--------------------------------
{{lines_table}}
--------------------------------
Items: {{item_count}}
Gold rate: Rs.{{gold_rate}}/g
Silver rate: Rs.{{silver_rate}}/g
--------------------------------
ESTIMATE TOTAL: Rs. {{total}}
MC discount: Rs. {{mc_discount}}
Cash discount: Rs. {{cash_discount}}
Total discount: Rs. {{total_discount}}
Advance: Rs. {{advance_paid}}
Balance: Rs. {{balance}}
================================
Rates subject to change.
This is an estimate, not a tax invoice.
`.trim();

const DEFAULT_ESTIMATE_TEMPLATE_SILVER = `
================================
{{shop_name}}
{{shop_address}}
Ph: {{shop_phone}}
GSTIN: {{shop_gstin}}
================================
SILVER ESTIMATE
Estimate: {{bill_number}}
Date: {{bill_date}}
Slab: {{rate_slab}}

--------------------------------
Customer: {{customer_name}}
Mobile: {{customer_mobile}}
Address: {{customer_address}}
--------------------------------
{{lines_table}}
--------------------------------
{{savings_block}}
Items: {{item_count}}
Silver rate: Rs.{{silver_rate}}/g (live Rs.{{live_silver_rate}}/g)
--------------------------------
ESTIMATE TOTAL: Rs. {{total}}
MC discount: Rs. {{mc_discount}}
Cash discount: Rs. {{cash_discount}}
Total discount: Rs. {{total_discount}}
Advance: Rs. {{advance_paid}}
Balance: Rs. {{balance}}
================================
Rates subject to change.
This is an estimate, not a tax invoice.

Note: Epson "Generate estimate" uses a separate
ROUGH ESTIMATE layout (weight, Rate/Gm, MC total,
CGST/SGST). Silver items omit purity/karat.
`.trim();

function preserveBillTemplate(raw) {
    return preservePrnTemplate(raw);
}

function repairCollapsedBillTemplate(raw) {
    const preserved = preserveBillTemplate(raw);
    if (!preserved.trim()) return preserved;
    if (preserved.includes('\n')) return preserved;

    let s = preserved;
    s = s.replace(/={8,}/g, '\n$&\n');
    s = s.replace(/-{8,}/g, '\n$&\n');
    const breaks = [
        'TAX INVOICE',
        'GOLD ESTIMATE',
        'SILVER ESTIMATE',
        'Bill:',
        'Estimate:',
        'Date:',
        'Slab:',
        'Customer:',
        'Mobile:',
        'Address:',
        'GSTIN:',
        'Ph:',
        'Items:',
        'Gold rate:',
        'Silver rate:',
        'TOTAL:',
        'ESTIMATE TOTAL:',
        'MC discount:',
        'Cash discount:',
        'Total discount:',
        'Collected:',
        'Advance:',
        'Balance:',
        'Rates subject',
        'Thank you',
        'This is an estimate',
        '{{lines_table}}',
    ];
    for (const token of breaks) {
        s = s.split(token).join(`\n${token}`);
    }
    return s
        .split('\n')
        .map((l) => l.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function applyBillTemplatePreservation(raw, fallback) {
    const preserved = preserveBillTemplate(raw);
    if (!preserved.trim()) return fallback;
    return repairCollapsedBillTemplate(preserved);
}

function migratePrintFormats(raw) {
    const pf = { ...(raw || {}) };
    if (pf.billTemplate?.trim()) {
        pf.billTemplate = applyBillTemplatePreservation(pf.billTemplate, DEFAULT_BILL_TEMPLATE);
    } else {
        pf.billTemplate = DEFAULT_BILL_TEMPLATE;
    }
    if (pf.estimateTemplateGold?.trim()) {
        pf.estimateTemplateGold = applyBillTemplatePreservation(
            pf.estimateTemplateGold,
            DEFAULT_ESTIMATE_TEMPLATE_GOLD,
        );
    } else {
        pf.estimateTemplateGold = DEFAULT_ESTIMATE_TEMPLATE_GOLD;
    }
    if (pf.estimateTemplateSilver?.trim()) {
        pf.estimateTemplateSilver = applyBillTemplatePreservation(
            pf.estimateTemplateSilver,
            DEFAULT_ESTIMATE_TEMPLATE_SILVER,
        );
    } else {
        pf.estimateTemplateSilver = DEFAULT_ESTIMATE_TEMPLATE_SILVER;
    }
    if (!pf.defaultQuoteOutputMode) pf.defaultQuoteOutputMode = 'pdf';
    if (pf.goldSlabRShowMc == null) pf.goldSlabRShowMc = true;
    if (!pf.estimatePrintMode) pf.estimatePrintMode = 'rough';
    if (pf.estimateDuplicateCopy == null) pf.estimateDuplicateCopy = true;
    return pf;
}

function resolveEstimateTemplateForBill(lines, printFormats) {
    const pf = migratePrintFormats(printFormats);
    const list = lines || [];
    let gold = 0;
    let silver = 0;
    for (const line of list) {
        const metal = String(line?.metal_type || '').toLowerCase();
        if (metal.startsWith('gold')) gold += 1;
        else silver += 1;
    }
    if (gold > 0 && silver === 0) return pf.estimateTemplateGold || DEFAULT_ESTIMATE_TEMPLATE_GOLD;
    if (silver > 0 && gold === 0) return pf.estimateTemplateSilver || DEFAULT_ESTIMATE_TEMPLATE_SILVER;
    return gold >= silver
        ? pf.estimateTemplateGold || DEFAULT_ESTIMATE_TEMPLATE_GOLD
        : pf.estimateTemplateSilver || DEFAULT_ESTIMATE_TEMPLATE_SILVER;
}

function tsplSafe(value) {
    return String(value ?? '')
        .replace(/"/g, "'")
        .replace(/\r?\n/g, ' ')
        .trim();
}

function preservePrnTemplate(raw) {
    if (raw == null) return '';
    return String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function repairCorruptedPrnTemplate(raw) {
    let s = preservePrnTemplate(raw).trim();
    if (!s) return DEFAULT_LABEL_PRN;

    s = s.replace(/SET PEEL OFFSET/gi, 'SET PEEL OFF\nSET');
    s = s.replace(/SET CUTTER OFFSET/gi, 'SET CUTTER OFF\nSET');
    s = s.replace(/SET PARTIAL_CUTTER OFFSET/gi, 'SET PARTIAL_CUTTER OFF\nSET');
    s = s.replace(/TEAR ON\s*CLS/gi, 'SET TEAR ON\nCLS');
    s = s.replace(/(\d)\s*mm\s*([A-Z])/gi, '$1 mm\n$2');
    s = s.replace(/0,0\s*([A-Z])/g, '0,0\n$1');
    s = s.replace(/ON\s*CLS/gi, 'ON\nCLS');
    s = s.replace(/CLS\s*CODEPAGE/gi, 'CLS\nCODEPAGE');
    s = s.replace(/1252\s*TEXT/gi, '1252\nTEXT');
    s = s.replace(/"\s*TEXT/gi, '"\nTEXT');
    s = s.replace(/"\s*QRCODE/gi, '"\nQRCODE');
    s = s.replace(/"\s*""\s*TEXT/gi, '""\nTEXT');

    const cmds = [
        'SIZE',
        'GAP',
        'DIRECTION',
        'REFERENCE',
        'OFFSET',
        'SET PEEL OFF',
        'SET CUTTER OFF',
        'SET PARTIAL_CUTTER OFF',
        'SET TEAR ON',
        'CLS',
        'CODEPAGE',
        'TEXT',
        'QRCODE',
        'BARCODE',
        'PRINT',
    ];
    for (const cmd of cmds) {
        const esc = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
        s = s.replace(new RegExp(`(?<!\\n)(${esc})`, 'gi'), '\n$1');
    }

    return s
        .split('\n')
        .map((l) => l.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
}

/** Restore TSPL line breaks when sanitize middleware collapsed multi-line PRN (OFF+SET → OFFSET bug). */
function normalizePrnTemplate(raw) {
    const preserved = preservePrnTemplate(raw);
    if (!preserved.trim()) return DEFAULT_LABEL_PRN;
    if (/mmGAP|ONCLS|PEEL OFFSET|CUTTER OFFSET|1252TEXT/i.test(preserved) || (preserved.length > 80 && !preserved.includes('\n'))) {
        return repairCorruptedPrnTemplate(preserved);
    }
    return preserved;
}

function formatTsplLineEndings(tspl) {
    const body = normalizePrnTemplate(tspl);
    return `${body.split('\n').join('\r\n')}\r\n`;
}

function preserveMultilineTemplate(raw) {
    if (raw == null) return '';
    return String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function renderTemplate(template, vars, opts) {
    const plainText = opts && opts.plainText;
    let out = plainText
        ? preserveMultilineTemplate(template)
        : normalizePrnTemplate(String(template || ''));
    const entries = Object.entries(vars || {});
    for (const [key, val] of entries) {
        const replacement = key === 'lines_table' ? String(val ?? '') : tsplSafe(val);
        out = out.split(`{{${key}}}`).join(replacement);
    }
    return out;
}

function formatMcRate(piece) {
    const n = Number(piece?.mc_rate);
    if (!Number.isFinite(n) || n <= 0) return '';
    return n.toFixed(2);
}

function formatWastage(piece) {
    const n = Number(piece?.wastage_pct);
    if (!Number.isFinite(n) || n <= 0) return '';
    return n.toFixed(2);
}

function formatOptionalNumber(piece, field, decimals = 2) {
    const n = Number(piece?.[field]);
    if (!Number.isFinite(n) || n <= 0) return '';
    return n.toFixed(decimals);
}

function formatLabelWeight(piece, field) {
    const n = Number(piece?.[field]);
    if (!Number.isFinite(n) || n <= 0) return '';
    return n.toFixed(3);
}

function buildLabelTemplateVars(piece, hw, profile) {
    const companyCode = profile?.companyCode || hw?.companyCode || 'BMS925';
    const net = formatLabelWeight(piece, 'avg_weight');
    const gross = formatLabelWeight(piece, 'gross_weight') || net;
    const fixedPrice =
        piece.fixed_price != null && Number(piece.fixed_price) > 0
            ? String(Math.round(Number(piece.fixed_price)))
            : '';
    return {
        barcode: String(piece.barcode || '').trim(),
        product_name: String(piece.product_name || piece.item_code || piece.style_code || '').trim(),
        style_code: String(piece.style_code || piece.product_name || '').trim(),
        item_code: String(piece.item_code || '').trim(),
        sku: String(piece.sku || '').trim(),
        gross_weight: gross,
        net_weight: net,
        avg_weight: net,
        wastage_pct: formatWastage(piece),
        mc_rate: formatMcRate(piece),
        mc_type: String(piece.mc_type || '').trim(),
        company_code: companyCode,
        metal_type: String(piece.metal_type || 'SILVER').toUpperCase(),
        pcs: String(piece.pcs || 1),
        pcs_label: (Number(piece.pcs) || 1) > 1 ? `Pcs:${Number(piece.pcs)}` : '',
        bags: String(piece.bags || '').trim(),
        bag_wt: piece.bag_wt != null && Number.isFinite(Number(piece.bag_wt))
            ? Number(piece.bag_wt).toFixed(3)
            : '',
        stone_charges: formatOptionalNumber(piece, 'stone_charges', 2),
        stone_wt: piece.stone_wt != null && Number.isFinite(Number(piece.stone_wt))
            ? Number(piece.stone_wt).toFixed(3)
            : '',
        /** Alias — templates may use {{stone_weight}} instead of {{stone_wt}}. */
        stone_weight:
            piece.stone_wt != null && Number.isFinite(Number(piece.stone_wt))
                ? Number(piece.stone_wt).toFixed(3)
                : '',
        box_charges: formatOptionalNumber(piece, 'box_charges', 2),
        purity: piece.purity != null && String(piece.purity).trim() !== ''
            ? String(piece.purity).trim()
            : '',
        floor_name: String(piece.floor_name || '').trim(),
        floor_code: String(piece.floor_code || '').trim(),
        box_code: String(piece.box_code || '').trim(),
        box_label: String(piece.box_label || piece.box_code || '').trim(),
        box_name: String(piece.box_name || piece.box_label || piece.box_code || '').trim(),
        rfid_tag: String(piece.rfid_tag || '').trim(),
        tag_no: String(piece.rfid_tag || '').trim(),
        fixed_price: fixedPrice,
    };
}

function buildLabelTemplateVarsFromItemData(itemData) {
    return {
        barcode: itemData.barcodeNumber || '',
        product_name: itemData.styleCode || '',
        style_code: itemData.styleCode || '',
        item_code: '',
        sku: '',
        gross_weight: itemData.grossWeight || itemData.weight || '0.000',
        net_weight: itemData.weight || '0.000',
        avg_weight: itemData.weight || '0.000',
        wastage_pct: '',
        mc_rate: '',
        mc_type: '',
        company_code: itemData.companyCode || 'BMS925',
        metal_type: itemData.material || 'SILVER',
        pcs: String(itemData.pcs || 1),
        pcs_label: (Number(itemData.pcs) || 1) > 1 ? `Pcs:${Number(itemData.pcs)}` : '',
        bags: String(itemData.bags || '').trim(),
    };
}

function renderPrnLabel(template, piece, hw, profile) {
    const vars = buildLabelTemplateVars(piece, hw, profile);
    return renderTemplate(template || DEFAULT_LABEL_PRN, vars);
}

function renderPrnLabelForPiece(piece, hw, profile, printFormats) {
    const resolved = resolveLabelPrnTemplate(piece, printFormats);
    const tspl = renderPrnLabel(resolved.template, piece, hw, profile);
    return { tspl, ...resolved };
}

function isGoldSlabRLine(line, rateSlab) {
    const slab = String(rateSlab || 'R').toUpperCase();
    return slab === 'R' && String(line.metal_type || '').toLowerCase().startsWith('gold');
}

function isSlabR(rateSlab) {
    return String(rateSlab || 'R').toUpperCase() === 'R';
}

function isSilverLine(line) {
    return String(line?.metal_type || '').toLowerCase().startsWith('silver');
}

function isGoldSlabRMcMode(line, rateSlab, printFormats) {
    const pf = migratePrintFormats(printFormats);
    return isGoldSlabRLine(line, rateSlab) && pf.goldSlabRShowMc !== false;
}

function thermalWastageDisplay(line, rateSlab, printFormats) {
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) return '0';
    if (line.displayWastagePct != null && line.displayWastagePct !== '') {
        return String(line.displayWastagePct);
    }
    if (line.wastage_pct != null && line.wastage_pct !== '') return String(line.wastage_pct);
    return '';
}

function thermalMcDisplay(line, rateSlab, printFormats) {
    if (isGoldSlabRMcMode(line, rateSlab, printFormats) && line.displayMcInr != null && Number(line.displayMcInr) > 0) {
        return String(Math.round(Number(line.displayMcInr)));
    }
    if (line.mc_rate != null && line.mc_rate !== '') return String(line.mc_rate);
    return '';
}

function thermalRateDisplay(line) {
    if (line.rateLocked || line.ratePerGram == null || !Number.isFinite(Number(line.ratePerGram))) {
        return '';
    }
    return String(Math.round(Number(line.ratePerGram)));
}

function thermalFmtNum(v, decimals = 2) {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v).trim();
    if (decimals <= 0) return String(Math.round(n));
    return n.toFixed(decimals);
}

function thermalClip(text, maxLen) {
    const t = String(text ?? '').trim();
    if (!t) return '';
    if (t.length <= maxLen) return t;
    return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

function thermalPushLine(out, text, lineWidth) {
    const row = String(text || '').trim();
    if (!row) return;
    out.push(row.length <= lineWidth ? row : row.slice(0, lineWidth));
}

function formatBillDate(raw) {
    if (!raw) {
        return new Date().toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    const s = String(raw).trim();
    return s.length > 40 ? s.slice(0, 40) : s;
}

function buildLinesTable(lines, lineWidth = 48, rateSlab = 'R', printFormats = null) {
    const slab = String(rateSlab || 'R').toUpperCase();
    const out = [];
    let idx = 0;
    for (const line of lines || []) {
        idx += 1;
        const bc = thermalClip(line.barcode || line.code, 14);
        const sku = thermalClip(line.sku, 8);
        const style = thermalClip(line.style_code, 16);
        const name = thermalClip(line.name || line.product_name, 22);
        const invoiceItem = thermalClip(line.invoice_item_name, 20);
        const hsn = thermalClip(line.hsn_code, 12);
        const size = thermalClip(line.size, 14);
        const wt = thermalFmtNum(line.weightGm ?? line.net_weight, 1);
        const pur = line.purity != null && line.purity !== '' ? String(line.purity) : '';
        const wast = thermalWastageDisplay(line, slab, printFormats);
        const rate = thermalRateDisplay(line);
        const mc = thermalMcDisplay(line, slab, printFormats);
        const mcType = thermalClip(line.mc_type, 10);
        const pcs = line.qty != null ? String(line.qty) : '1';
        const box =
            line.box_charges != null && Number.isFinite(Number(line.box_charges))
                ? String(Math.round(Number(line.box_charges)))
                : '0';
        const stone =
            line.stone_charges != null && Number.isFinite(Number(line.stone_charges))
                ? String(Math.round(Number(line.stone_charges)))
                : '0';
        const stWt = thermalFmtNum(line.stone_wt, 2);
        const metal = thermalClip(String(line.metal_type || 'silver'), 12);
        const fixed =
            line.fixed_price != null && Number(line.fixed_price) > 0
                ? String(Math.round(Number(line.fixed_price)))
                  : '';
        const amt =
            line.lineTotalInr != null && Number.isFinite(Number(line.lineTotalInr))
                ? Math.round(Number(line.lineTotalInr))
                : line.unitInr != null
                  ? Math.round(Number(line.unitInr) * (line.qty || 1))
                  : null;

        thermalPushLine(out, `#${idx}  ${bc}  ${sku}  ${style}`, lineWidth);
        if (name) thermalPushLine(out, `Product: ${name}`, lineWidth);
        if (invoiceItem) thermalPushLine(out, `Item: ${invoiceItem}`, lineWidth);
        if (hsn || size) thermalPushLine(out, `HSN: ${hsn || '—'}  Size: ${size || '—'}`, lineWidth);

        const wtLine = [`Wt:${wt || '—'}g`, pur ? `Pur:${pur}` : '', `Pcs:${pcs}`, metal ? `Metal:${metal}` : '']
            .filter(Boolean)
            .join('  ');
        thermalPushLine(out, wtLine, lineWidth);

        const priceParts = [];
        if (rate) priceParts.push(`Rate:${rate}`);
        if (isSlabR(slab)) {
            if (mc) priceParts.push(`MC:${mc}`);
            if (wast !== '' && wast !== '0') priceParts.push(`Wast:${wast}%`);
        } else {
            if (wast !== '') priceParts.push(`Wast:${wast}%`);
            if (mc) priceParts.push(`MC:${mc}`);
        }
        if (mcType) priceParts.push(`MCType:${mcType}`);
        if (priceParts.length) thermalPushLine(out, priceParts.join('  '), lineWidth);

        const chargeParts = [`Box:${box}`, `Stone:${stone}`];
        if (stWt) chargeParts.push(`StWt:${stWt}g`);
        if (fixed) chargeParts.push(`Fixed:${fixed}`);
        thermalPushLine(out, chargeParts.join('  '), lineWidth);

        if (amt != null) thermalPushLine(out, `Amount: Rs.${amt}`, lineWidth);
        thermalPushLine(out, '-'.repeat(Math.min(32, lineWidth)), lineWidth);
    }
    if (out.length && out[out.length - 1].match(/^-+$/)) out.pop();
    return out.join('\n') || '(no items)';
}

function buildSavingsBlock(bill, rates) {
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    const rateSlab = String(session.rateSlab || 'R').toUpperCase();
    if (rateSlab !== 'R') return '';
    let sumMetalDisc = 0;
    let sumMcDisc = 0;
    for (const line of bill.lines || []) {
        const d = computeSlabRLineDiscounts(line, rates);
        sumMetalDisc += d.metalDisc;
        sumMcDisc += d.mcDisc;
    }
    if (sumMetalDisc <= 0 && sumMcDisc <= 0) return '';
    const out = [];
    out.push('--- YOUR SAVINGS (Slab R) ---');
    if (sumMetalDisc > 0) {
        out.push(`Silver rate discount: Rs.${sumMetalDisc.toLocaleString('en-IN')}`);
    }
    if (sumMcDisc > 0) {
        out.push(`MC discount: Rs.${sumMcDisc.toLocaleString('en-IN')}`);
    }
    const totalSave = sumMetalDisc + sumMcDisc;
    out.push(`Total discount: Rs.${totalSave.toLocaleString('en-IN')}`);
    out.push('--------------------------------');
    return out.join('\n');
}

function buildBillTemplateVars(bill, printFormats, rates) {
    const pf = migratePrintFormats(printFormats);
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    if (session.goldSlabRShowMc === false) {
        pf.goldSlabRShowMc = false;
    }
    const advance = Number(session.advancePaidInr ?? session.advance_paid ?? 0) || 0;
    const total = Number(bill.total_inr) || 0;
    const collected = Number(session.collectedAmountInr);
    const mcDiscount = Number(session.mcDiscountInr) || 0;
    const cashDiscount =
        session.cashDiscountInr != null && Number.isFinite(Number(session.cashDiscountInr))
            ? Number(session.cashDiscountInr)
            : 0;
    const totalDiscount =
        Number(session.totalDiscountInr ?? session.billingDiscountInr) ||
        mcDiscount + cashDiscount;
    const rateSlab = String(session.rateSlab || 'R').toUpperCase();
    return {
        shop_name: pf.shopName || bill.shop_name || 'B N MARLECHA SILVER',
        shop_address: pf.shopAddress || '',
        shop_phone: pf.shopPhone || '',
        shop_gstin: pf.shopGstin || '',
        bill_number: bill.bill_number || '',
        bill_date: formatBillDate(bill.bill_date),
        customer_name: bill.customer_name || 'Walk-in',
        customer_mobile: bill.customer_mobile || session.mobile || session.customerMobile || '',
        customer_address: bill.customer_address || session.address || session.customerAddress || '',
        customer_gst: bill.customer_gst || session.customerGst || '',
        rate_slab: rateSlab,
        lines_table: buildLinesTable(bill.lines || [], 48, rateSlab, pf),
        item_count: String((bill.lines || []).length),
        subtotal: String(Math.round(total)),
        total: String(Math.round(total)),
        advance_paid: String(Math.round(advance)),
        balance: String(Math.round(Math.max(0, total - advance))),
        collected_amount: Number.isFinite(collected) ? String(Math.round(collected)) : '',
        mc_discount: mcDiscount > 0 ? String(Math.round(mcDiscount)) : '',
        cash_discount: cashDiscount !== 0 ? String(Math.round(cashDiscount)) : '',
        total_discount: totalDiscount !== 0 ? String(Math.round(totalDiscount)) : '',
        gold_rate: rates?.gold != null ? String(Math.round(rates.gold)) : '',
        silver_rate: rates?.silver != null ? String(Math.round(rates.silver)) : '',
        savings_block: buildSavingsBlock(bill, rates),
        live_silver_rate: rates?.silver != null ? String(Math.round(rates.silver)) : '',
    };
}

function escPosQrCode(data, moduleSize = 4) {
    const GS = '\x1D';
    const payload = String(data || '').trim();
    if (!payload) return '';
    const storeLen = payload.length + 3;
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;
    let out = '';
    out += GS + '(k' + String.fromCharCode(4, 0, 49, 65, 50, 0);
    out += GS + '(k' + String.fromCharCode(3, 0, 49, 67, Math.max(3, Math.min(8, moduleSize)));
    out += GS + '(k' + String.fromCharCode(3, 0, 49, 69, 48);
    out += GS + '(k' + String.fromCharCode(pL, pH, 49, 80, 48) + payload;
    out += GS + '(k' + String.fromCharCode(3, 0, 49, 81, 48);
    return out;
}

function textToEscPos(text, opts = {}) {
    const ESC = '\x1B';
    const GS = '\x1D';
    let out = ESC + '@';
    const qrData = opts.qrData != null ? String(opts.qrData).trim() : '';
    if (qrData && !opts.qrAfterInit) {
        out += ESC + 'a' + '\x02';
        out += escPosQrCode(qrData, opts.qrModuleSize || 4);
        out += '\r\n';
        out += ESC + 'a' + '\x00';
    }
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    out += normalized.split('\n').join('\r\n');
    out += '\r\n\r\n\r\n';
    out += GS + 'V' + '\x00';
    return out;
}

/** Epson estimate: QR top-right, then two-column header, then body (no extra blank band). */
function assembleRoughEstimateEscPos(headerLines, bodyText, qrData) {
    const ESC = '\x1B';
    const GS = '\x1D';
    let out = ESC + '@';
    const qr = String(qrData || '').trim();
    if (qr) {
        out += ESC + 'a' + '\x02';
        out += escPosQrCode(qr, 3);
        out += ESC + 'a' + '\x00';
        out += '\n';
    }
    const header = (headerLines || []).filter(Boolean).join('\n');
    const body = String(bodyText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    out += header;
    if (header && body) out += '\n';
    out += body.split('\n').join('\r\n');
    out += '\r\n\r\n\r\n';
    out += GS + 'V' + '\x00';
    return out;
}

function buildSampleReceiptEscPos() {
    return textToEscPos(
        '========================\n' +
            'KC ERP — Epson test print\n' +
            '------------------------\n' +
            'If you can read this,\n' +
            'billing printer is OK.\n' +
            '========================\n',
    );
}

function renderBillEscPos(template, bill, printFormats, rates) {
    const vars = buildBillTemplateVars(bill, printFormats, rates);
    const body = renderTemplate(template || DEFAULT_BILL_TEMPLATE, vars, { plainText: true });
    return textToEscPos(body);
}

const ROUGH_ESTIMATE_WIDTH = 42;
const ESC_BOLD_ON = '\x1B\x45\x01';
const ESC_BOLD_OFF = '\x1B\x45\x00';
/** Reserved — double-width ESC/POS breaks 80mm lines; Grand Total uses bold only. */
const ESC_EMPHASIS_ON = '\x1B\x21\x30';
const ESC_EMPHASIS_OFF = '\x1B\x21\x00';

function roughVisibleLen(text) {
    return String(text || '')
        .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
        .replace(/\x1B./g, '')
        .length;
}

function roughBold(text) {
    const t = String(text ?? '');
    if (!t) return '';
    return `${ESC_BOLD_ON}${t}${ESC_BOLD_OFF}`;
}

function roughGrandTotalRow(left, right, width = ROUGH_ESTIMATE_WIDTH) {
    return roughPadRow(roughBold(String(left ?? '')), roughBold(String(right ?? '')), width);
}

function roughCenter(text, width = ROUGH_ESTIMATE_WIDTH) {
    const t = String(text || '').trim();
    if (!t) return '';
    if (t.length >= width) return t;
    const pad = Math.floor((width - t.length) / 2);
    return `${' '.repeat(Math.max(0, pad))}${t}`;
}

function roughField(label, value, labelWidth = 14) {
    const lbl = String(label || '').trim();
    const val = String(value ?? '').trim();
    const padded = `${lbl}:`.padEnd(labelWidth, ' ');
    const line = `${padded} ${val}`;
    if (line.length <= ROUGH_ESTIMATE_WIDTH) return line;
    return `${lbl}:\n${' '.repeat(labelWidth)} ${val}`;
}

function roughDash(width = 20) {
    return '-'.repeat(Math.min(width, ROUGH_ESTIMATE_WIDTH));
}

function isMcPerPieceType(mcType) {
    const t = String(mcType || '').toUpperCase().replace(/\s/g, '');
    return t.includes('PC') || t.includes('PIECE') || t === 'MC/PCS';
}

function lineHasPieceSlabFields(line) {
    return (
        line?.mc_rate_slab_r != null ||
        line?.mc_rate_slab_w != null ||
        line?.mc_rate_slab_f != null ||
        line?.metal_slab_r_pct != null ||
        line?.metal_slab_w_pct != null ||
        line?.metal_slab_f_pct != null
    );
}

function printPieceSlabMcRatePerUnit(line, rateSlab) {
    if (rateSlab === 'W') {
        return line?.mc_rate_slab_w ?? line?.mc_rate_slab_r ?? line?.mc_rate ?? null;
    }
    if (rateSlab === 'F') {
        return line?.mc_rate_slab_f ?? line?.mc_rate_slab_w ?? line?.mc_rate ?? null;
    }
    return line?.mc_rate_slab_r ?? line?.mc_rate ?? null;
}

/** Catalog / list MC before slab overlay (stock mc_rate column). */
function roughCatalogMcRatePerUnit(line) {
    if (line?.manualEntry) {
        const billMc = Number(line?.mc_rate);
        if (Number.isFinite(billMc) && billMc > 0) return billMc;
    }
    const raw =
        line?.mc_rate_catalog ??
        line?.mc_rate_standard ??
        line?.catalog_mc_rate ??
        null;
    if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) {
        return Number(raw);
    }
    const slabRates = [
        Number(line?.mc_rate_slab_r),
        Number(line?.mc_rate_slab_w),
        Number(line?.mc_rate_slab_f),
    ].filter((n) => Number.isFinite(n) && n > 0);
    const billMc = Number(line?.mc_rate);
    if (slabRates.length && Number.isFinite(billMc) && billMc > 0) {
        const maxRate = Math.max(billMc, ...slabRates);
        const minRate = Math.min(billMc, ...slabRates);
        if (maxRate > minRate) return maxRate;
    }
    if (!lineHasPieceSlabFields(line)) {
        const r = Number(line?.mc_rate);
        if (Number.isFinite(r) && r > 0) return r;
    }
    return null;
}

function manualMcDiscountPerUnitForPrint(line, rateSlab) {
    if (!line?.manualEntry) return 0;
    const slab = String(rateSlab || 'R').toUpperCase();
    const field =
        slab === 'W' ? 'mc_rate_slab_w' : slab === 'F' ? 'mc_rate_slab_f' : 'mc_rate_slab_r';
    const v = Number(line[field]);
    return Number.isFinite(v) && v > 0 ? v : 0;
}

function enrichLineMcDisplayFieldsForPrint(line, rateSlab) {
    if (!line || typeof line !== 'object') return line;
    const before = Number(line.displayMcBeforeDiscount);
    const after = Number(line.displayMcInr);
    if (Number.isFinite(before) && Number.isFinite(after) && before > after) {
        return line;
    }
    if (line.manualEntry) {
        const baseRate = Number(line.mc_rate);
        const disc = manualMcDiscountPerUnitForPrint(line, rateSlab);
        if (Number.isFinite(baseRate) && baseRate > 0 && disc > 0) {
            const appliedRate = Math.max(0, baseRate - disc);
            if (baseRate > appliedRate) {
                const { wt, qty } = roughMcWeightOrQty(line);
                const std = isMcPerPieceType(line?.mc_type)
                    ? baseRate * qty
                    : baseRate * (wt > 0 ? wt : qty);
                const app = isMcPerPieceType(line?.mc_type)
                    ? appliedRate * qty
                    : appliedRate * (wt > 0 ? wt : qty);
                if (std > app) {
                    return {
                        ...line,
                        displayMcBeforeDiscount: Math.round(std),
                        displayMcInr: Math.round(app),
                    };
                }
            }
        }
    }
    const base = roughCatalogMcRatePerUnit(line);
    const applied = roughAppliedMcRatePerUnit(line, rateSlab);
    if (base == null || applied == null || !(base > applied)) return line;
    const { wt, qty } = roughMcWeightOrQty(line);
    const std = isMcPerPieceType(line?.mc_type) ? base * qty : base * (wt > 0 ? wt : qty);
    const app = isMcPerPieceType(line?.mc_type)
        ? applied * qty
        : applied * (wt > 0 ? wt : qty);
    if (!(std > app)) return line;
    return {
        ...line,
        displayMcBeforeDiscount: Math.round(std),
        displayMcInr: Math.round(app),
    };
}

function enrichBillLinesForEstimatePrint(bill, rateSlab) {
    if (!bill || !Array.isArray(bill.lines)) return bill;
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    const slab = String(rateSlab || session.rateSlab || 'R').toUpperCase();
    return {
        ...bill,
        lines: bill.lines.map((ln) => enrichLineMcDisplayFieldsForPrint(ln, slab)),
    };
}

function roughAppliedMcRatePerUnit(line, rateSlab) {
    if (line?.manualEntry) {
        const base = Number(line?.mc_rate);
        if (!Number.isFinite(base) || base <= 0) return 0;
        const disc = manualMcDiscountPerUnitForPrint(line, rateSlab);
        return disc > 0 ? Math.max(0, base - disc) : base;
    }
    if (lineHasPieceSlabFields(line)) {
        const slab = printPieceSlabMcRatePerUnit(line, rateSlab);
        if (slab != null && Number.isFinite(Number(slab))) return Number(slab);
        return 0;
    }
    const r = Number(line?.mc_rate);
    return Number.isFinite(r) && r > 0 ? r : 0;
}

function roughMcWeightOrQty(line) {
    const wt = Number(line?.originalWeightGm ?? line?.net_weight ?? line?.weightGm) || 0;
    const qty = Number(line?.qty) || 1;
    return { wt, qty };
}

/**
 * Attach catalog mc_rate from stock lookup for legacy bills (display/print only).
 * lookup: { byStockId?: Map|Record, byBarcode?: Map|Record }
 */
function enrichBillLinesMcCatalogForPrint(bill, lookup) {
    if (!bill || !lookup) return bill;
    const lines = Array.isArray(bill.lines) ? bill.lines : [];
    const byId = lookup.byStockId || lookup.byId;
    const byBarcode = lookup.byBarcode || lookup.byCode;
    const idGet = (id) => {
        if (id == null) return null;
        if (byId instanceof Map) return byId.get(Number(id));
        if (byId && typeof byId === 'object') return byId[String(id)] ?? byId[Number(id)];
        return null;
    };
    const codeGet = (code) => {
        const c = String(code || '').trim();
        if (!c) return null;
        if (byBarcode instanceof Map) return byBarcode.get(c);
        if (byBarcode && typeof byBarcode === 'object') return byBarcode[c];
        return null;
    };
    bill.lines = lines.map((line) => {
        if (roughCatalogMcRatePerUnit(line) != null) return line;
        let cat = line?.stock_piece_id != null ? idGet(line.stock_piece_id) : null;
        if (cat == null) cat = codeGet(line?.barcode || line?.code);
        if (cat != null && Number.isFinite(Number(cat)) && Number(cat) > 0) {
            return { ...line, mc_rate_catalog: Number(cat) };
        }
        return line;
    });
    return bill;
}

function formatPurityForEstimate(line) {
    if (isSilverLine(line)) return '';
    return purityToKarats(line.purity);
}

function purityToKarats(purity) {
    const p = Number(purity);
    if (!Number.isFinite(p) || p <= 0) return '';
    if (p >= 99) return '24 K';
    if (p >= 91) return '22 K';
    if (p >= 74) return '18 K';
    return `${p}%`;
}

function extractEstimateNo(billNumber) {
    const s = String(billNumber || '').trim();
    const m = s.match(/(\d+)\s*$/);
    if (m) return String(parseInt(m[1], 10));
    return s || '0';
}

function formatRoughDateTime(raw) {
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    let h = d.getHours();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yy}  ${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

function roughVAddnGrams(line, rateSlab, printFormats) {
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) return '0.000';
    const wt = Number(line.weightGm ?? line.net_weight) || 0;
    const wastPct = Number(line.displayWastagePct ?? line.wastage_pct) || 0;
    if (wt <= 0 || wastPct <= 0) return '0.000';
    return (wt * (wastPct / 100)).toFixed(3);
}

function roughTodaySilverPerG(session, rates) {
    const dr = Array.isArray(session?.displayRates) ? session.displayRates : [];
    const row = dr.find((r) => String(r?.metal_type || '').toLowerCase() === 'silver');
    if (row?.display_rate != null) {
        const n = Number(row.display_rate);
        if (Number.isFinite(n) && n > 0) return n / 1000;
    }
    if (rates?.silver != null && Number.isFinite(Number(rates.silver))) {
        return Number(rates.silver);
    }
    return null;
}

function enrichPrintRatesFromBill(bill, rates) {
    const session = bill?.session && typeof bill.session === 'object' ? bill.session : {};
    const todaySilver = roughTodaySilverPerG(session, rates);
    const next = rates && typeof rates === 'object' ? { ...rates } : {};
    if (todaySilver != null) next.silver = todaySilver;
    return next;
}

function roughRateForLine(line, rates) {
    const metal = String(line.metal_type || '').toLowerCase();
    if (metal.startsWith('silver') && rates?.silver != null) {
        return Number(rates.silver).toFixed(2);
    }
    const fromLine = thermalRateDisplay(line);
    if (fromLine) {
        const n = Number(fromLine);
        if (isSilverLine(line)) return n.toFixed(2);
        return String(Math.round(n));
    }
    if (metal.startsWith('gold') && rates?.gold != null) {
        return String(Math.round(Number(rates.gold)));
    }
    return '';
}

function roughMcValueAmount(line, rateSlab, printFormats) {
    const amt = roughMcAmountInr(line, rateSlab, printFormats);
    return amt > 0 ? amt : 0;
}

function shouldShowRoughMcLine(line, rateSlab, printFormats) {
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) return true;
    return isSilverLine(line);
}

function roughMcForLine(line, rateSlab, printFormats) {
    if (!shouldShowRoughMcLine(line, rateSlab, printFormats)) return '';
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) {
        const mc = thermalMcDisplay(line, rateSlab, printFormats);
        if (!mc || Number(mc) === 0) return '';
        return String(Math.round(Number(mc)));
    }
    const mcRate = Number(line.mc_rate);
    if (!Number.isFinite(mcRate) || mcRate === 0) return '';
    const netWt = Number(line.weightGm ?? line.net_weight) || 0;
    const qty = Number(line.qty) || 1;
    if (isMcPerPieceType(line.mc_type)) {
        return String(Math.round(mcRate * qty));
    }
    if (netWt > 0) {
        return String(Math.round(mcRate * netWt));
    }
    return String(Math.round(mcRate));
}

function billGstEnabled(bill) {
    if (!bill) return true;
    if (bill.gst_enabled === false) return false;
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    if (session.gstEnabled === false) return false;
    return true;
}

function lineTaxableFromTotal(lineTotalInr, gstEnabled = true) {
    const total = Number(lineTotalInr) || 0;
    if (total <= 0) return 0;
    if (!gstEnabled) return Math.round(total * 100) / 100;
    return Math.round((total / 1.03) * 100) / 100;
}

function splitRoughGst(taxable, gstEnabled = true) {
    const base = Number(taxable) || 0;
    if (!gstEnabled) {
        const gross = Math.round(base * 100) / 100;
        return { taxable: base, cgst: 0, sgst: 0, gross };
    }
    const cgst = Math.round(base * 0.015 * 100) / 100;
    const sgst = cgst;
    const gross = Math.round((base + cgst + sgst) * 100) / 100;
    return { taxable: base, cgst, sgst, gross };
}

function shouldShowRoughValue(value) {
    if (value == null || value === '') return false;
    const n = Number(value);
    if (Number.isFinite(n)) return n !== 0;
    return String(value).trim().length > 0;
}

function roughMoney(value, decimals = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? '').trim();
    return n.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** Whole-rupee display for item / grand totals (thermal). */
function roughMoneyRoundedTotal(value) {
    return roughMoney(Math.round(Number(value) || 0));
}

function roughDiscountVisible(amount) {
    const n = Number(amount) || 0;
    return n >= 1;
}

function formatRoughRowValue(value) {
    if (typeof value === 'number') {
        if (value < 0) return `-${roughMoney(Math.abs(value))}`;
        return roughMoney(value);
    }
    return String(value ?? '').trim();
}

function roughPadRow(left, right, width = ROUGH_ESTIMATE_WIDTH) {
    const l = String(left || '');
    const r = String(right || '').trim();
    if (!r) return l;
    const rVis = roughVisibleLen(r);
    let lOut = l;
    let lVis = roughVisibleLen(lOut);
    if (lVis + rVis + 1 > width) {
        while (lVis + rVis + 1 > width && lOut.length > 0) {
            lOut = lOut.slice(0, -1);
            lVis = roughVisibleLen(lOut);
        }
    }
    const gap = Math.max(1, width - lVis - rVis);
    return `${lOut}${' '.repeat(gap)}${r}`;
}

function roughKvRow(label, value, width = ROUGH_ESTIMATE_WIDTH, opts = {}) {
    if (!shouldShowRoughValue(value)) return '';
    const lblRaw = String(label || '').trim();
    const lbl = opts.boldLabel ? roughBold(lblRaw) : lblRaw;
    const val = formatRoughRowValue(value);
    return roughPadRow(lbl, val, width);
}

function roughSplitRow(left, right, width = ROUGH_ESTIMATE_WIDTH) {
    const l = String(left || '').trim();
    const r = String(right || '').trim();
    if (!r) return l;
    return roughPadRow(l, r, width);
}

/** Right column width reserved for date/time on estimate header. */
const ROUGH_HEADER_RIGHT_RESERVE = 18;

function roughHeaderTwoCol(left, right, width = ROUGH_ESTIMATE_WIDTH) {
    const l = String(left || '');
    const r = String(right || '').trim();
    if (!r) return l;
    const maxLeft = Math.max(8, width - ROUGH_HEADER_RIGHT_RESERVE);
    let lVis = roughVisibleLen(l);
    let leftOut = l;
    if (lVis > maxLeft) {
        leftOut = l.slice(0, maxLeft);
        lVis = roughVisibleLen(leftOut);
    }
    const gap = Math.max(1, width - lVis - roughVisibleLen(r));
    return `${leftOut}${' '.repeat(gap)}${r}`;
}

/** Discount rows — label regular weight; amount bold on the right. */
function roughDiscountRow(label, amount, width = ROUGH_ESTIMATE_WIDTH) {
    const plainLabel = String(label || '').trim();
    const val = formatRoughRowValue(-Math.abs(Number(amount) || 0));
    const boldVal = roughBold(val);
    const gap = Math.max(1, width - plainLabel.length - roughVisibleLen(boldVal));
    return `${plainLabel}${' '.repeat(gap)}${boldVal}`;
}

function roughSandwichAmount(amount, width = ROUGH_ESTIMATE_WIDTH) {
    const val = roughMoney(amount);
    const dash = '--------';
    const pad = Math.max(0, width - dash.length);
    const dashLine = `${' '.repeat(pad)}${dash}`;
    const valPad = Math.max(0, width - val.length);
    const valLine = `${' '.repeat(valPad)}${val}`;
    return `${dashLine}\n${valLine}\n${dashLine}`;
}

function roughIstParts(iso) {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000;
    const ist = new Date(utcMs + 330 * 60_000);
    return {
        dd: String(ist.getDate()).padStart(2, '0'),
        mm: String(ist.getMonth() + 1).padStart(2, '0'),
        yyyy: ist.getFullYear(),
        h: ist.getHours(),
        min: ist.getMinutes(),
    };
}

function resolveRoughBillDateTime(bill) {
    const createdRaw = bill?.created_at;
    if (createdRaw) {
        const created = new Date(createdRaw);
        if (!Number.isNaN(created.getTime())) return created;
    }
    const billRaw = bill?.bill_date;
    const s = String(billRaw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10))) {
        const nowParts = roughIstParts(new Date());
        if (nowParts) {
            return new Date(
                `${s.slice(0, 10)}T${String(nowParts.h).padStart(2, '0')}:${String(nowParts.min).padStart(2, '0')}:00`,
            );
        }
    }
    if (billRaw) {
        const billD = new Date(billRaw);
        if (!Number.isNaN(billD.getTime())) return billD;
    }
    return new Date();
}

function formatRoughHeaderDate(raw) {
    const parts = roughIstParts(raw instanceof Date ? raw : raw ? new Date(raw) : new Date());
    if (!parts) return '';
    return `${parts.dd}-${parts.mm}-${parts.yyyy}`;
}

function formatRoughHeaderTime(raw) {
    const parts = roughIstParts(raw instanceof Date ? raw : raw ? new Date(raw) : new Date());
    if (!parts) return '';
    let h = parts.h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const min = String(parts.min).padStart(2, '0');
    return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

function buildRoughEstimateHeaderLines(bill, printFormats) {
    const pf = migratePrintFormats(printFormats);
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    const shopName = String(pf.shopName || bill.shop_name || 'B N MARLECHA SILVER').trim();
    const estNo = extractEstimateNo(bill.bill_number);
    const when = resolveRoughBillDateTime(bill);
    const customerName = String(bill.customer_name || 'Walk-in').trim();
    const customerMobile = String(
        bill.customer_mobile || session.mobile || session.customerMobile || '',
    ).trim();
    const customerLine = customerMobile ? `${customerName} / ${customerMobile}` : customerName;
    const dateLabel = formatRoughHeaderDate(when);
    const timeLabel = formatRoughHeaderTime(when);
    const staffName = roughEmpName(bill, session);
    return [
        roughHeaderTwoCol(roughBold(shopName.toUpperCase()), `DATE : ${dateLabel}`),
        roughHeaderTwoCol(roughBold(`ESTIMATE NO ${estNo}`), `TIME : ${timeLabel}`),
        roughHeaderTwoCol(customerLine, staffName),
    ];
}

function extractHeaderRates(session, rates) {
    const dr = Array.isArray(session?.displayRates) ? session.displayRates : [];
    const findDisplay = (key, divisor) => {
        const row = dr.find((r) => String(r?.metal_type || '').toLowerCase() === key);
        if (row && row.display_rate != null) {
            const n = Number(row.display_rate);
            if (Number.isFinite(n) && n > 0) return Math.round(n / divisor);
        }
        return null;
    };
    let silver = rates?.silver != null ? Math.round(Number(rates.silver)) : findDisplay('silver', 1000);
    let gold22 = findDisplay('gold_22k', 10);
    let gold18 = findDisplay('gold_18k', 10);
    const goldPerG = Number(session?.goldPerG ?? session?.gold_per_g ?? rates?.gold ?? 0);
    if (!gold22 && goldPerG > 0) gold22 = Math.round(goldPerG * 0.916);
    if (!gold18 && goldPerG > 0) gold18 = Math.round(goldPerG * 0.75);
    if (silver == null && rates?.silver != null) silver = Math.round(Number(rates.silver));
    return { silver, gold22, gold18 };
}

function roughEmpName(bill, session) {
    return String(
        session?.operatorDisplayName ||
            session?.operatorName ||
            session?.empName ||
            bill?.operator_name ||
            bill?.emp_name ||
            '',
    ).trim();
}

function isGiftEstimateLine(line) {
    if (line?.mrpMode || line?.manualCategory === 'gift') return true;
    const inv = String(line?.invoice_item_name || '').toUpperCase();
    if (inv.includes('GIFT ITEM')) return true;
    const pieceRate = Number(line?.unitInr ?? line?.fixed_price ?? 0);
    const wt = Number(line?.weightGm ?? line?.net_weight ?? 0);
    return pieceRate > 0 && wt <= 0;
}

function isGoldEstimateLine(line) {
    if (isGiftEstimateLine(line)) return false;
    return String(line?.metal_type || '').toLowerCase().startsWith('gold');
}

function roughItemDisplayName(line) {
    return String(
        line?.sku ||
            line?.product_name ||
            line?.name ||
            line?.invoice_item_name ||
            line?.style_code ||
            'Item',
    ).trim();
}

function roughLessWeight(line) {
    const bagWt = Number(line?.bag_wt) || 0;
    if (bagWt <= 0) return 0;
    const bagsRaw = String(line?.bags || '').trim();
    const bagsNum = Number(bagsRaw);
    if (Number.isFinite(bagsNum) && bagsNum > 0) return bagWt * bagsNum;
    if (bagsRaw) return bagWt;
    return 0;
}

function roughOtherCharges(line, opts = {}) {
    const excludeDiamond = opts.excludeDiamond === true;
    let fixed = 0;
    const wt = Number(line?.weightGm ?? line?.originalWeightGm ?? line?.net_weight) || 0;
    if (wt > 0 && !isGiftEstimateLine(line)) {
        fixed = Number(line?.fixed_price) || 0;
    }
    return (
        fixed +
        (Number(line?.box_charges) || 0) +
        (Number(line?.stone_charges) || 0) +
        (excludeDiamond ? 0 : Number(line?.diamond_charges) || 0)
    );
}

function roughOtherChargesLabel(line) {
    const stone = Number(line?.stone_charges) || 0;
    const box = Number(line?.box_charges) || 0;
    if (stone > 0 && box > 0) return 'Other Charges';
    if (stone > 0) return 'Stone Charges';
    if (box > 0) return 'Box Charges';
    return 'Other Charges';
}

function roughMcDisplayValue(line, rateSlab, printFormats) {
    if (!shouldShowRoughMcLine(line, rateSlab, printFormats)) return null;
    const mcRate = Number(line?.mc_rate);
    if (Number.isFinite(mcRate) && mcRate > 0) return mcRate;
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) {
        const mc = line?.displayMcInr != null ? Number(line.displayMcInr) : NaN;
        if (Number.isFinite(mc) && mc > 0) return Math.round(mc);
    }
    return null;
}

function roughStandardMcAmountInr(line, rateSlab, printFormats) {
    if (!shouldShowRoughMcLine(line, rateSlab, printFormats)) return 0;
    if (line?.displayMcBeforeDiscount != null && Number(line.displayMcBeforeDiscount) > 0) {
        return Math.round(Number(line.displayMcBeforeDiscount));
    }
    const mcRate = roughCatalogMcRatePerUnit(line);
    if (mcRate != null && mcRate > 0) {
        const { wt, qty } = roughMcWeightOrQty(line);
        if (isMcPerPieceType(line?.mc_type)) return Math.round(mcRate * qty);
        if (wt > 0) return Math.round(mcRate * wt);
        return Math.round(mcRate);
    }
    const legacyRate = Number(line?.mc_rate);
    if (Number.isFinite(legacyRate) && legacyRate > 0) {
        const { wt, qty } = roughMcWeightOrQty(line);
        if (isMcPerPieceType(line?.mc_type)) return Math.round(legacyRate * qty);
        if (wt > 0) return Math.round(legacyRate * wt);
        return Math.round(legacyRate);
    }
    if (isGoldSlabRMcMode(line, rateSlab, printFormats) && Number(line?.displayMcInr) > 0) {
        return Math.round(Number(line.displayMcInr));
    }
    return 0;
}

function roughAppliedMcAmountInr(line, rateSlab, printFormats) {
    if (!shouldShowRoughMcLine(line, rateSlab, printFormats)) return 0;
    if (
        line?.displayMcBeforeDiscount != null &&
        line?.displayMcInr != null &&
        Number(line.displayMcBeforeDiscount) > Number(line.displayMcInr)
    ) {
        return Math.round(Number(line.displayMcInr));
    }
    const mcRate = roughAppliedMcRatePerUnit(line, rateSlab);
    const { wt, qty } = roughMcWeightOrQty(line);
    if (isMcPerPieceType(line?.mc_type)) return Math.round(mcRate * qty);
    if (wt > 0) return Math.round(mcRate * wt);
    return Math.round(mcRate);
}

function roughMcAmountInr(line, rateSlab, printFormats) {
    return roughStandardMcAmountInr(line, rateSlab, printFormats);
}

function roughMcDiscountAmount(line, rateSlab, rates, printFormats) {
    if (isGoldEstimateLine(line)) return 0;
    const pf = printFormats || {};
    const before = Number(line?.displayMcBeforeDiscount);
    const after = Number(line?.displayMcInr);
    if (Number.isFinite(before) && Number.isFinite(after) && before > after) {
        return Math.round(before - after);
    }
    const std = roughStandardMcAmountInr(line, rateSlab, pf);
    const applied = roughAppliedMcAmountInr(line, rateSlab, pf);
    if (std > applied) return Math.round(std - applied);
    if (rateSlab === 'R') return computeSlabRLineDiscounts(line, rates, rateSlab).mcDisc;
    const base = roughCatalogMcRatePerUnit(line);
    const slabMc = roughAppliedMcRatePerUnit(line, rateSlab);
    if (base != null && base > slabMc) {
        const { wt, qty } = roughMcWeightOrQty(line);
        const stdAmt = isMcPerPieceType(line?.mc_type) ? base * qty : base * (wt > 0 ? wt : qty);
        const appAmt = isMcPerPieceType(line?.mc_type)
            ? slabMc * qty
            : slabMc * (wt > 0 ? wt : qty);
        if (stdAmt > appAmt) return Math.round(stdAmt - appAmt);
    }
    return 0;
}

function roughSilverRateDiscountInfo(line, rates) {
    const wt = Number(line?.weightGm ?? line?.net_weight) || 0;
    const liveSilver = rates?.silver != null ? Number(rates.silver) : null;
    const lineRate = line?.ratePerGram != null ? Number(line.ratePerGram) : null;
    if (wt > 0 && liveSilver != null && lineRate != null && liveSilver > lineRate) {
        const perG = Math.round(liveSilver - lineRate);
        const wtLabel = Math.round(wt) === wt ? String(Math.round(wt)) : String(wt);
        return {
            amount: Math.round((liveSilver - lineRate) * wt),
            label: `Disc on Silver Rate (${wtLabel} x ${perG})`,
        };
    }
    return { amount: 0, label: 'Disc on Silver Rate' };
}

function roughGoldRateLabel(line) {
    const p = Number(line?.purity) || 0;
    if ((p >= 74 && p <= 76) || Math.abs(p - 75) < 1.5) return 'Rate/Gm (18ct)';
    return 'Rate/Gm (22ct)';
}

function roughVAddnPercent(line, rateSlab, printFormats) {
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) return 0;
    const wast = line?.displayWastagePct ?? line?.wastage_pct;
    const n = Number(wast);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function roughMetalValueForLine(line, rates, rateSlab, printFormats) {
    const wt = Number(line?.weightGm ?? line?.net_weight) || 0;
    const rate = Number(roughRateForLine(line, rates)) || 0;
    if (wt <= 0 || rate <= 0) return 0;
    if (isGoldEstimateLine(line)) {
        const vPct = roughVAddnPercent(line, rateSlab, printFormats);
        return Math.round(rate * wt * (1 + vPct / 100) * 100) / 100;
    }
    const vaddnG = Number(roughVAddnGrams(line, rateSlab, printFormats)) || 0;
    return Math.round(rate * (wt + vaddnG) * 100) / 100;
}

function roughPreDiscountSubtotal(line, rates, rateSlab, printFormats) {
    return Math.round(
        roughMetalValueForLine(line, rates, rateSlab, printFormats) +
            roughMcAmountInr(line, rateSlab, printFormats) +
            roughOtherCharges(line, { excludeDiamond: true }),
    );
}

function roughNetSubtotalAfterDiscounts(line, rates, rateSlab, printFormats) {
    const preDisc = roughPreDiscountSubtotal(line, rates, rateSlab, printFormats);
    const silverDisc = roughSilverRateDiscountInfo(line, rates);
    const mcDisc = roughMcDiscountAmount(line, rateSlab, rates, printFormats);
    const totalDisc =
        (roughDiscountVisible(silverDisc.amount) ? silverDisc.amount : 0) +
        (roughDiscountVisible(mcDisc) ? mcDisc : 0);
    return Math.max(0, Math.round(preDisc - totalDisc));
}

function roughGiftDiscountInfo(line, gstEnabled = true) {
    const qty = Number(line?.qty) || 1;
    const basePer =
        Number(line?.mrpListPrice) > 0
            ? Number(line.mrpListPrice)
            : Number(line?.fixed_price) || 0;
    const effPer =
        Number(line?.fixed_price_r) > 0
            ? Number(line.fixed_price_r)
            : Number(line?.unitInr ?? line?.fixed_price) || basePer;
    const mrpTotal = basePer > 0 ? Math.round(basePer * qty * 100) / 100 : 0;
    const effPiecesTotal = Math.round(effPer * qty * 100) / 100;
    const disc = mrpTotal > 0 ? Math.max(0, Math.round((mrpTotal - effPiecesTotal) * 100) / 100) : 0;
    const pct = mrpTotal > 0 ? Math.round((disc / mrpTotal) * 100) : 0;
    const itemTotal = Math.round(Number(line?.lineTotalInr) || 0);
    const taxable = lineTaxableFromTotal(itemTotal, gstEnabled);
    return { basePer, mrpTotal, disc, pct, taxable, itemTotal, effPiecesTotal };
}

function pushIf(out, row) {
    if (row) out.push(row);
}

function buildMarlechaSilverItemSection(line, idx, rateSlab, rates, printFormats, gstEnabled = true) {
    const out = [];
    const tag = String(line?.barcode || line?.code || '').trim();
    out.push(roughBold(`Item ${idx} : ${roughItemDisplayName(line)}`));
    if (tag) out.push(`Tag : ${tag}`);
    pushIf(out, roughKvRow('Weight (gm)', Number(line?.weightGm ?? line?.net_weight) || 0));
    const vPct = roughVAddnPercent(line, rateSlab, printFormats);
    if (vPct > 0) {
        pushIf(out, roughKvRow('V. ADDN (%)', vPct.toFixed(2)));
    }
    pushIf(out, roughKvRow('Rate/Gm', roughRateForLine(line, rates)));
    const mcVal = roughMcValueAmount(line, rateSlab, printFormats);
    if (mcVal > 0) pushIf(out, roughKvRow('MC Value', mcVal));

    const otherCh = roughOtherCharges(line, { excludeDiamond: true });
    if (otherCh > 0) {
        pushIf(out, roughKvRow(roughOtherChargesLabel(line), otherCh));
    }

    const preDisc = roughPreDiscountSubtotal(line, rates, rateSlab, printFormats);
    out.push(roughSandwichAmount(preDisc));

    const silverDisc = roughSilverRateDiscountInfo(line, rates);
    const mcDisc = roughMcDiscountAmount(line, rateSlab, rates, printFormats);
    if (roughDiscountVisible(silverDisc.amount)) {
        pushIf(out, roughDiscountRow(silverDisc.label, silverDisc.amount));
    }
    if (roughDiscountVisible(mcDisc)) {
        pushIf(out, roughDiscountRow('Disc on MC Value', mcDisc));
    }

    const taxable = roughNetSubtotalAfterDiscounts(line, rates, rateSlab, printFormats);
    out.push(roughSandwichAmount(taxable));
    const gst = splitRoughGst(taxable, gstEnabled);
    const itemTotal = Math.round(gst.gross);
    if (gstEnabled) {
        pushIf(out, roughKvRow('CGST (1.5%)', gst.cgst));
        pushIf(out, roughKvRow('SGST (1.5%)', gst.sgst));
    }
    out.push(roughPadRow(roughBold('Total :'), roughBold(roughMoneyRoundedTotal(itemTotal))));
    out.push(roughDash(ROUGH_ESTIMATE_WIDTH));

    const savings =
        (roughDiscountVisible(silverDisc.amount) ? silverDisc.amount : 0) +
        (roughDiscountVisible(mcDisc) ? mcDisc : 0);
    return { lines: out, taxable, savings, total: itemTotal };
}

function buildMarlechaGiftItemSection(line, idx, gstEnabled = true) {
    const out = [];
    const tag = String(line?.barcode || line?.code || '').trim();
    const gift = roughGiftDiscountInfo(line, gstEnabled);
    out.push(roughBold(`Item ${idx} : ${roughItemDisplayName(line)}`));
    if (tag) out.push(`Tag : ${tag}`);
    if (gift.basePer > 0) pushIf(out, roughKvRow('MRP', gift.basePer));
    pushIf(out, roughKvRow('Qty', Number(line?.qty) || 1));
    if (gift.disc > 0) {
        pushIf(out, roughDiscountRow('Disc on MRP', gift.disc));
    }
    out.push(roughSandwichAmount(gift.taxable));
    const gst = splitRoughGst(gift.taxable, gstEnabled);
    if (gstEnabled) {
        pushIf(out, roughKvRow('CGST (1.5%)', gst.cgst));
        pushIf(out, roughKvRow('SGST (1.5%)', gst.sgst));
    }
    const itemTotal = gift.itemTotal > 0 ? gift.itemTotal : Math.round(gst.gross);
    out.push(roughPadRow(roughBold('Total :'), roughBold(roughMoneyRoundedTotal(itemTotal))));
    out.push(roughDash(ROUGH_ESTIMATE_WIDTH));
    return { lines: out, taxable: gift.taxable, savings: gift.disc, total: itemTotal };
}

function buildMarlechaGoldItemSection(line, idx, rateSlab, rates, printFormats, gstEnabled = true) {
    const out = [];
    const tag = String(line?.barcode || line?.code || '').trim();
    out.push(roughBold(`Item ${idx} : ${roughItemDisplayName(line)}`));
    if (tag) out.push(`Tag : ${tag}`);
    pushIf(out, roughKvRow('Weight (gm)', Number(line?.weightGm ?? line?.net_weight) || 0));
    pushIf(out, roughKvRow('Less Weight', roughLessWeight(line)));
    pushIf(out, roughKvRow(roughGoldRateLabel(line), roughRateForLine(line, rates)));
    pushIf(out, roughKvRow('V.ADDN (%)', roughVAddnPercent(line, rateSlab, printFormats)));
    pushIf(out, roughKvRow('MC', roughMcDisplayValue(line, rateSlab, printFormats)));
    pushIf(out, roughKvRow('Other Charges', roughOtherCharges(line, { excludeDiamond: true })));
    pushIf(out, roughKvRow('Diamond Charges', Number(line?.diamond_charges) || 0));

    const preDisc = roughPreDiscountSubtotal(line, rates, rateSlab, printFormats);
    out.push(roughSandwichAmount(preDisc));

    const taxable = lineTaxableFromTotal(line?.lineTotalInr, gstEnabled);
    out.push(roughSandwichAmount(taxable));
    const gst = splitRoughGst(taxable, gstEnabled);
    const itemTotal = Math.round(gst.gross);
    if (gstEnabled) {
        pushIf(out, roughKvRow('CGST (1.5%)', gst.cgst));
        pushIf(out, roughKvRow('SGST (1.5%)', gst.sgst));
    }
    out.push(roughPadRow(roughBold('Total :'), roughBold(roughMoneyRoundedTotal(itemTotal))));
    out.push(roughDash(ROUGH_ESTIMATE_WIDTH));
    return { lines: out, taxable, savings: 0, total: itemTotal };
}

function buildMarlechaEstimateItemSection(line, idx, rateSlab, rates, printFormats, gstEnabled = true) {
    if (isGiftEstimateLine(line)) return buildMarlechaGiftItemSection(line, idx, gstEnabled);
    if (isGoldEstimateLine(line)) return buildMarlechaGoldItemSection(line, idx, rateSlab, rates, printFormats, gstEnabled);
    return buildMarlechaSilverItemSection(line, idx, rateSlab, rates, printFormats, gstEnabled);
}

function computeSlabRLineDiscounts(line, rates, rateSlab = 'R') {
    const out = { metalDisc: 0, mcDisc: 0 };
    const wt = Number(line.weightGm ?? line.net_weight) || 0;
    if (wt <= 0) return out;
    const liveSilver = rates?.silver != null ? Number(rates.silver) : null;
    const lineRate = line.ratePerGram != null ? Number(line.ratePerGram) : null;
    if (isSilverLine(line) && liveSilver != null && lineRate != null && liveSilver > lineRate) {
        out.metalDisc = Math.round((liveSilver - lineRate) * wt);
    }
    const baseMc = roughCatalogMcRatePerUnit(line);
    const slabMc = printPieceSlabMcRatePerUnit(line, rateSlab);
    if (baseMc != null && baseMc > 0 && slabMc != null && baseMc > Number(slabMc)) {
        const mcType = String(line.mc_type || '').toUpperCase();
        if (mcType.includes('/PC') || mcType.includes('PER PC')) {
            out.mcDisc = Math.round((baseMc - Number(slabMc)) * (Number(line.qty) || 1));
        } else {
            out.mcDisc = Math.round((baseMc - Number(slabMc)) * wt);
        }
    }
    return out;
}

function buildRoughEstimateContent(bill, printFormats, rates, isDuplicate) {
    const pf = migratePrintFormats(printFormats);
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    if (session.goldSlabRShowMc === false) {
        pf.goldSlabRShowMc = false;
    }
    const rateSlab = String(session.rateSlab || 'R').toUpperCase();
    const gstOn = billGstEnabled(bill);
    const printBill = enrichBillLinesForEstimatePrint(bill, rateSlab);
    const out = [];

    out.push(roughDash(ROUGH_ESTIMATE_WIDTH));

    const items = printBill.lines || [];
    let grandTotal = 0;
    let totalSavings = 0;
    const nonGiftItems = items.filter((ln) => !isGiftEstimateLine(ln));
    const allGoldBill =
        nonGiftItems.length > 0 && nonGiftItems.every((ln) => isGoldEstimateLine(ln));
    for (let i = 0; i < items.length; i += 1) {
        const block = buildMarlechaEstimateItemSection(items[i], i + 1, rateSlab, rates, pf, gstOn);
        out.push(...block.lines);
        grandTotal += block.total || 0;
        totalSavings += block.savings || 0;
    }

    if (!items.length) {
        out.push('Item 1 : —');
        out.push('Tag : —');
        out.push(roughDash(ROUGH_ESTIMATE_WIDTH));
    }

    if (!grandTotal && Number(bill.total_inr) > 0) {
        grandTotal = Math.round(Number(bill.total_inr));
    } else {
        grandTotal = Math.round(grandTotal);
    }

    const preDiscountTotal = Math.round(grandTotal + (roughDiscountVisible(totalSavings) ? totalSavings : 0));
    out.push('='.repeat(ROUGH_ESTIMATE_WIDTH));
    out.push(
        roughPadRow(roughBold('Total :'), roughBold(roughMoneyRoundedTotal(preDiscountTotal))),
    );
    if (!allGoldBill && roughDiscountVisible(totalSavings)) {
        out.push(
            roughPadRow(roughBold('Total Savings :'), roughBold(roughMoneyRoundedTotal(totalSavings))),
        );
    }
    out.push(roughGrandTotalRow('Grand Total :', roughMoneyRoundedTotal(grandTotal)));
    out.push('='.repeat(ROUGH_ESTIMATE_WIDTH));
    out.push('Valid for One Hour Only');
    out.push('GST will be issued on Confirmation GST Bill');
    out.push('Join Our Savings Plan');
    out.push('');
    out.push('');

    return out.join('\n');
}

function buildRoughEstimateCopy(bill, printFormats, rates, isDuplicate) {
    const pf = migratePrintFormats(printFormats);
    const printRates = enrichPrintRatesFromBill(bill, rates);
    const headerLines = buildRoughEstimateHeaderLines(bill, pf);
    const content = buildRoughEstimateContent(bill, printFormats, printRates, isDuplicate);
    return [...headerLines, content].join('\n');
}

function buildRoughEstimateBody(bill, printFormats, rates) {
    const printRates = enrichPrintRatesFromBill(bill, rates);
    return buildRoughEstimateCopy(bill, printFormats, printRates, false);
}

function buildSampleBillForPreview(kind) {
    const isSilver = kind === 'estimate_silver' || kind === 'silver';
    const rateSlab = isSilver ? 'R' : 'R';
    return {
        shop_name: 'B N MARLECHA SILVER',
        bill_number: 'EST-1042',
        bill_date: new Date().toISOString(),
        customer_name: 'Sample Customer',
        customer_mobile: '9841166668',
        customer_address: 'Sample Address',
        total_inr: 125000,
        session: {
            rateSlab,
            goldPerG: 13200,
            silverPerG: 270,
            goldSlabRShowMc: true,
        },
        lines: isSilver
            ? [
                  {
                      barcode: 'CHO-69321',
                      sku: 'PLAIN CHOMBU',
                      style_code: 'CHOMBU',
                      product_name: 'CHO',
                      metal_type: 'SILVER',
                      weightGm: 450.4,
                      purity: 80,
                      mc_rate: 4,
                      mc_rate_slab_r: 0,
                      mc_type: 'MC/GM',
                      ratePerGram: 265,
                      lineTotalInr: 118500,
                      qty: 1,
                  },
              ]
            : [
                  {
                      barcode: 'GOLD-001',
                      sku: 'RING',
                      style_code: 'RING',
                      product_name: 'Gold Ring',
                      metal_type: 'GOLD',
                      weightGm: 8.5,
                      purity: 91.6,
                      mc_rate: 450,
                      mc_rate_slab_r: 225,
                      mc_type: 'MC/GM',
                      ratePerGram: 13200,
                      lineTotalInr: 115000,
                      qty: 1,
                  },
              ],
    };
}

function renderEstimateEscPos(bill, printFormats, rates) {
    const pf = migratePrintFormats(printFormats);
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    const rateSlab = String(session.rateSlab || 'R').toUpperCase();
    bill = enrichBillLinesForEstimatePrint(bill, rateSlab);
    const printRates = enrichPrintRatesFromBill(bill, rates);
    if (pf.estimatePrintMode === 'custom') {
        const template = resolveEstimateTemplateForBill(bill.lines, pf);
        const vars = buildBillTemplateVars(bill, printFormats, printRates);
        const body = renderTemplate(template, vars, { plainText: true });
        return textToEscPos(body);
    }
    const headerLines = buildRoughEstimateHeaderLines(bill, pf);
    const bodyText = buildRoughEstimateContent(bill, printFormats, printRates, false);
    const estNo = extractEstimateNo(bill.bill_number);
    return assembleRoughEstimateEscPos(headerLines, bodyText, estNo);
}

function previewTemplateText(template, bill, printFormats, rates) {
    const vars = buildBillTemplateVars(bill, printFormats, rates);
    return renderTemplate(template || DEFAULT_BILL_TEMPLATE, vars, { plainText: true });
}

function resolveBillingWindowsPrinterName(hw) {
    const bp = hw?.billingPrinter || {};
    const name =
        bp.windowsPrinterName ||
        bp.windowsPrinter?.name ||
        bp.windowsName ||
        'EPSON TM-m30III Receipt';
    return String(name).trim() || 'EPSON TM-m30III Receipt';
}

function resolveBillsBanaoWindowsPrinterName(hw) {
    const bb = hw?.billsBanaoPrinter || {};
    const name = bb.windowsPrinterName || 'Bills Banao Printer';
    return String(name).trim() || 'Bills Banao Printer';
}

function resolveBillingPrinterConfig(hw) {
    const bp = hw?.billingPrinter || {};
    if (bp.type === 'windows') {
        const name = resolveBillingWindowsPrinterName(hw);
        if (!name) return null;
        return { type: 'windows', address: name };
    }
    if (!bp.address) return null;
    const isNetwork = bp.type === 'network' || /^\d+\.\d+\.\d+\.\d+/.test(String(bp.address));
    if (isNetwork) {
        return {
            type: 'network',
            address: String(bp.address).trim(),
            port: Number(bp.port) || 9100,
        };
    }
    return {
        type: 'serial',
        address: String(bp.address).trim(),
    };
}

function escPosToBase64(escPos) {
    return Buffer.from(String(escPos || ''), 'latin1').toString('base64');
}

function shouldUsePrnTemplate(profile, printFormats) {
    if (profile?.labelFormat === 'tspl') return false;
    if (profile?.labelFormat === 'prn') return true;
    return printFormats?.labelUsePrn !== false;
}

module.exports = {
    DEFAULT_LABEL_PRN,
    DEFAULT_LABEL_PRN_GOLD,
    DEFAULT_LABEL_PRN_SILVER,
    DEFAULT_LABEL_PRN_SILVER_EXTRAS,
    DEFAULT_BILL_TEMPLATE,
    DEFAULT_ESTIMATE_TEMPLATE_GOLD,
    DEFAULT_ESTIMATE_TEMPLATE_SILVER,
    LABEL_RULE_FIELD_KEYS,
    normalizePrnTemplate,
    formatTsplLineEndings,
    renderTemplate,
    renderPrnLabel,
    renderPrnLabelForPiece,
    resolveLabelPrnTemplate,
    migrateLabelPrnRules,
    buildDefaultLabelPrnRules,
    ruleMatchesPiece,
    pieceFieldHasValue,
    newRuleId,
    buildLabelTemplateVars,
    buildLabelTemplateVarsFromItemData,
    buildBillTemplateVars,
    buildLinesTable,
    buildRoughEstimateBody,
    enrichBillLinesMcCatalogForPrint,
    enrichBillLinesForEstimatePrint,
    buildSampleBillForPreview,
    previewTemplateText,
    renderBillEscPos,
    renderEstimateEscPos,
    resolveEstimateTemplateForBill,
    migratePrintFormats,
    preserveBillTemplate,
    resolveBillingPrinterConfig,
    resolveBillingWindowsPrinterName,
    resolveBillsBanaoWindowsPrinterName,
    escPosToBase64,
    buildSampleReceiptEscPos,
    shouldUsePrnTemplate,
};
