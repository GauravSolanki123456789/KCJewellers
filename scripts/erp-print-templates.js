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
TEXT 530,23,"ROMAN.TTF",180,1,9,""
TEXT 738,21,"ROMAN.TTF",180,1,8,""
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
TEXT 530,23,"ROMAN.TTF",180,1,9,""
TEXT 720,21,"ROMAN.TTF",180,1,8,""
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
TEXT 530,23,"ROMAN.TTF",180,1,9,""
TEXT 738,21,"ROMAN.TTF",180,1,8,""
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim();

/** Legacy alias — silver standard layout. */
const DEFAULT_LABEL_PRN = DEFAULT_LABEL_PRN_SILVER;

const LABEL_RULE_FIELD_KEYS = [
    'gross_weight',
    'bag_wt',
    'stone_charges',
    'stone_wt',
    'wastage_pct',
    'mc_rate',
    'bags',
    'box_charges',
];

function newRuleId() {
    return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildDefaultLabelPrnRules(fallbackTemplate) {
    const silverFallback = normalizePrnTemplate(fallbackTemplate || DEFAULT_LABEL_PRN_SILVER);
    return [
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
Advance: Rs. {{advance_paid}}
Balance: Rs. {{balance}}
================================
Thank you — visit again!
`.trim();

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

function buildLabelTemplateVars(piece, hw, profile) {
    const companyCode = profile?.companyCode || hw?.companyCode || 'BMS925';
    const net =
        piece.avg_weight != null ? Number(piece.avg_weight).toFixed(3) : '0.000';
    const gross =
        piece.gross_weight != null
            ? Number(piece.gross_weight).toFixed(3)
            : net;
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
        bags: String(piece.bags || '').trim(),
        bag_wt: piece.bag_wt != null && Number.isFinite(Number(piece.bag_wt))
            ? Number(piece.bag_wt).toFixed(3)
            : '',
        stone_charges: formatOptionalNumber(piece, 'stone_charges', 2),
        stone_wt: piece.stone_wt != null && Number.isFinite(Number(piece.stone_wt))
            ? Number(piece.stone_wt).toFixed(3)
            : '',
        box_charges: formatOptionalNumber(piece, 'box_charges', 2),
        purity: piece.purity != null && String(piece.purity).trim() !== ''
            ? String(piece.purity).trim()
            : '',
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

function buildLinesTable(lines, lineWidth = 32) {
    const out = [];
    for (const line of lines || []) {
        const bc = String(line.barcode || line.code || '').slice(0, 14);
        const nm = String(line.name || line.product_name || '').slice(0, 16);
        const wt =
            line.weightGm != null
                ? `${Number(line.weightGm).toFixed(3)}g`
                : line.avg_weight != null
                  ? `${Number(line.avg_weight).toFixed(3)}g`
                  : '';
        const amt =
            line.lineTotalInr != null
                ? `Rs.${Math.round(Number(line.lineTotalInr))}`
                : line.unitInr != null
                  ? `Rs.${Math.round(Number(line.unitInr) * (line.qty || 1))}`
                  : '';
        out.push(`${bc} ${nm}`.slice(0, lineWidth));
        if (wt || amt) out.push(`  ${wt}  ${amt}`.trim().slice(0, lineWidth));
    }
    return out.join('\n') || '(no items)';
}

function buildBillTemplateVars(bill, printFormats, rates) {
    const pf = printFormats || {};
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    const advance = Number(session.advancePaidInr ?? session.advance_paid ?? 0) || 0;
    const total = Number(bill.total_inr) || 0;
    return {
        shop_name: pf.shopName || bill.shop_name || 'B N MARLECHA SILVER',
        shop_address: pf.shopAddress || '',
        shop_phone: pf.shopPhone || '',
        shop_gstin: pf.shopGstin || '',
        bill_number: bill.bill_number || '',
        bill_date: bill.bill_date || new Date().toLocaleDateString('en-IN'),
        customer_name: bill.customer_name || 'Walk-in',
        customer_mobile: bill.customer_mobile || session.customerMobile || '',
        customer_address: bill.customer_address || session.customerAddress || '',
        customer_gst: bill.customer_gst || session.customerGst || '',
        lines_table: buildLinesTable(bill.lines || []),
        item_count: String((bill.lines || []).length),
        subtotal: String(Math.round(total)),
        total: String(Math.round(total)),
        advance_paid: String(Math.round(advance)),
        balance: String(Math.round(Math.max(0, total - advance))),
        gold_rate: rates?.gold != null ? String(Math.round(rates.gold)) : '',
        silver_rate: rates?.silver != null ? String(Math.round(rates.silver)) : '',
    };
}

function textToEscPos(text) {
    const ESC = '\x1B';
    const GS = '\x1D';
    let out = ESC + '@';
    out += String(text || '').replace(/\r\n/g, '\n');
    out += '\n\n\n';
    out += GS + 'V' + '\x00';
    return out;
}

function renderBillEscPos(template, bill, printFormats, rates) {
    const vars = buildBillTemplateVars(bill, printFormats, rates);
    const body = renderTemplate(template || DEFAULT_BILL_TEMPLATE, vars, { plainText: true });
    return textToEscPos(body);
}

function resolveBillingPrinterConfig(hw) {
    const bp = hw?.billingPrinter || {};
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
    renderBillEscPos,
    resolveBillingPrinterConfig,
    shouldUsePrnTemplate,
};
