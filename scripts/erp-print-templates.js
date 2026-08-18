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
        /** Alias — templates may use {{stone_weight}} instead of {{stone_wt}}. */
        stone_weight:
            piece.stone_wt != null && Number.isFinite(Number(piece.stone_wt))
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
        session.cashDiscountInr != null
            ? Number(session.cashDiscountInr)
            : Number.isFinite(collected)
              ? Math.round(total - collected)
              : 0;
    const totalDiscount =
        Number(session.totalDiscountInr ?? session.billingDiscountInr) ||
        (Number.isFinite(collected) ? mcDiscount + cashDiscount : mcDiscount);
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
        cash_discount: Number.isFinite(collected) && cashDiscount !== 0 ? String(Math.round(cashDiscount)) : '',
        total_discount: totalDiscount !== 0 ? String(Math.round(totalDiscount)) : '',
        gold_rate: rates?.gold != null ? String(Math.round(rates.gold)) : '',
        silver_rate: rates?.silver != null ? String(Math.round(rates.silver)) : '',
    };
}

function textToEscPos(text) {
    const ESC = '\x1B';
    const GS = '\x1D';
    let out = ESC + '@';
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    out += normalized.split('\n').join('\r\n');
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

function roughCenter(text, width = ROUGH_ESTIMATE_WIDTH) {
    const t = String(text || '').trim();
    if (!t) return '';
    if (t.length >= width) return t.slice(0, width);
    const pad = Math.floor((width - t.length) / 2);
    return `${' '.repeat(Math.max(0, pad))}${t}`;
}

function roughField(label, value) {
    const lbl = String(label || '').trim();
    const val = String(value ?? '').trim();
    const line = `${lbl}: ${val}`;
    if (line.length <= ROUGH_ESTIMATE_WIDTH) return line;
    return `${lbl}:\n  ${val}`;
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

function roughRateForLine(line, rates) {
    const fromLine = thermalRateDisplay(line);
    if (fromLine) {
        const n = Number(fromLine);
        if (isSilverLine(line)) return n.toFixed(2);
        return String(Math.round(n));
    }
    const metal = String(line.metal_type || '').toLowerCase();
    if (metal.startsWith('silver') && rates?.silver != null) {
        return Number(rates.silver).toFixed(2);
    }
    if (metal.startsWith('gold') && rates?.gold != null) {
        return String(Math.round(Number(rates.gold)));
    }
    return '';
}

function shouldShowRoughMcLine(line, rateSlab, printFormats) {
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) return true;
    return isSilverLine(line);
}

function roughMcForLine(line, rateSlab, printFormats) {
    if (!shouldShowRoughMcLine(line, rateSlab, printFormats)) return '';
    const mc = thermalMcDisplay(line, rateSlab, printFormats);
    if (!mc || Number(mc) === 0) return '';
    if (isGoldSlabRMcMode(line, rateSlab, printFormats)) return String(Math.round(Number(mc)));
    const n = Number(mc);
    return Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : mc;
}

function lineTaxableFromTotal(lineTotalInr) {
    const total = Number(lineTotalInr) || 0;
    if (total <= 0) return 0;
    return Math.round((total / 1.03) * 100) / 100;
}

function splitRoughGst(taxable) {
    const base = Number(taxable) || 0;
    const cgst = Math.round(base * 0.015 * 100) / 100;
    const sgst = cgst;
    const gross = Math.round((base + cgst + sgst) * 100) / 100;
    return { taxable: base, cgst, sgst, gross };
}

function buildRoughEstimateItemSection(line, rateSlab, billDate, rates, printFormats) {
    const out = [];
    const dt = formatRoughDateTime(billDate);
    const ornament = isSilverLine(line) ? 'Silver Ornaments' : 'Gold Ornaments';
    out.push(`NEW ITEM: ${ornament}`);
    out.push(dt);
    const tag = String(line.barcode || line.code || '').trim();
    out.push(`Qty: ${line.qty != null ? line.qty : 1}  Tag: ${tag || '—'}`);
    const purityLabel = purityToKarats(line.purity);
    if (purityLabel) out.push(roughField('Purity', purityLabel));
    const grossWt = Number(line.gross_weight);
    const stoneWt = Number(line.stone_wt);
    const netWt = Number(line.weightGm ?? line.net_weight) || 0;
    if (Number.isFinite(grossWt) && grossWt > 0) {
        out.push(roughField('Gross Wt', `${grossWt.toFixed(3)} gms`));
    }
    if (Number.isFinite(stoneWt) && stoneWt > 0) {
        out.push(roughField('Stone Wt', `${stoneWt.toFixed(3)} gms`));
    }
    out.push(roughField('Net Wt', `${netWt.toFixed(3)} gms`));
    out.push(roughField('V.ADDN', roughVAddnGrams(line, rateSlab, printFormats)));
    const rate = roughRateForLine(line, rates);
    if (rate) {
        out.push(roughField('Rate', rate));
        const rateNum = Number(rate);
        if (Number.isFinite(rateNum) && rateNum > 0 && netWt > 0) {
            const metalValue = Math.round(rateNum * netWt * 100) / 100;
            out.push(roughField('Value', `Rs.${metalValue.toFixed(2)}`));
        }
    }
    const stoneCh = Number(line.stone_charges);
    if (Number.isFinite(stoneCh) && stoneCh > 0) {
        out.push(roughField('Stone Chrg', stoneCh.toFixed(2)));
    }
    const mc = roughMcForLine(line, rateSlab, printFormats);
    if (mc) out.push(roughField('MC', mc));
    const taxable = lineTaxableFromTotal(line.lineTotalInr);
    out.push(roughField('Total', taxable.toFixed(2)));
    return { lines: out, taxable };
}

function buildRoughEstimateCopy(bill, printFormats, rates, isDuplicate) {
    const pf = migratePrintFormats(printFormats);
    const session = bill.session && typeof bill.session === 'object' ? bill.session : {};
    if (session.goldSlabRShowMc === false) {
        pf.goldSlabRShowMc = false;
    }
    const rateSlab = String(session.rateSlab || 'R').toUpperCase();
    const shopName = String(pf.shopName || bill.shop_name || 'B N MARLECHA SILVER')
        .trim()
        .toUpperCase();
    const estNo = extractEstimateNo(bill.bill_number);
    const billDate = bill.bill_date || bill.created_at || new Date();
    const phone = String(pf.shopPhone || '').trim();
    const dots = '.'.repeat(ROUGH_ESTIMATE_WIDTH);
    const dash = '-'.repeat(20);
    const out = [];

    if (isDuplicate) {
        out.push('');
        out.push(roughCenter('Duplicate Copy'));
        out.push(roughCenter(`Rough Estimate : ${estNo}`));
        out.push('');
    }

    out.push(roughCenter(shopName));
    out.push(roughCenter(`ROUGH ESTIMATE:${estNo}`));
    out.push(dots);

    const items = bill.lines || [];
    let sumTaxable = 0;
    for (let i = 0; i < items.length; i += 1) {
        const block = buildRoughEstimateItemSection(items[i], rateSlab, billDate, rates, pf);
        out.push(...block.lines);
        sumTaxable += block.taxable;
        if (i < items.length - 1) out.push('');
    }

    if (!items.length) {
        out.push('NEW ITEM : Gold Ornaments');
        out.push('Qty: 0   Tag:');
    }

    out.push(dash);
    const gst = splitRoughGst(sumTaxable);
    out.push(roughField('CGST 1.5%', gst.cgst.toFixed(2)));
    out.push(roughField('SGST 1.5%', gst.sgst.toFixed(2)));
    out.push(dash);
    out.push(roughField('Final Amt', gst.gross.toFixed(2)));
    out.push(dots);

    const contact = phone || '7867867886,8825888888,9169161616';
    out.push(`CONTACT : ${contact}`);
    out.push('**valid only for 1hr. prices may change**');
    out.push('Join Our Monthly Savings Scheme !!');
    out.push('Tax Bill will be issued on Confirmation');

    return out.join('\n');
}

function buildRoughEstimateBody(bill, printFormats, rates) {
    const original = buildRoughEstimateCopy(bill, printFormats, rates, false);
    const duplicate = buildRoughEstimateCopy(bill, printFormats, rates, true);
    return `${original}\n\n${duplicate}`;
}

function renderEstimateEscPos(bill, printFormats, rates) {
    const body = buildRoughEstimateBody(bill, printFormats, rates);
    return textToEscPos(body);
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
    renderBillEscPos,
    renderEstimateEscPos,
    resolveEstimateTemplateForBill,
    migratePrintFormats,
    preserveBillTemplate,
    resolveBillingPrinterConfig,
    resolveBillingWindowsPrinterName,
    escPosToBase64,
    buildSampleReceiptEscPos,
    shouldUsePrnTemplate,
};
