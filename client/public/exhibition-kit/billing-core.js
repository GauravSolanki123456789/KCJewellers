/**
 * AUTO-GENERATED — do not edit by hand.
 * Run: npm run build:exhibition-billing (or npm run build in client/)
 * Source: src/lib/exhibition/exhibition-billing-bundle.ts
 */

"use strict";
var KcExhibitionBillingModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/exhibition/exhibition-billing-bundle.ts
  var exhibition_billing_bundle_exports = {};
  __export(exhibition_billing_bundle_exports, {
    KcExhibitionBilling: () => api
  });

  // src/lib/pricing.ts
  function clampPct(n, lo, hi) {
    if (Number.isNaN(n)) return 0;
    return Math.max(lo, Math.min(hi, n));
  }
  function wholesaleIsActive(w) {
    if (!w) return false;
    return Math.abs(w.wholesale_making_charge_discount_percent) > 1e-6 || Math.abs(w.wholesale_markup_percent) > 1e-6;
  }
  function categoryDiscountPct(item) {
    const n = Number(item.discount_percentage || 0) || 0;
    return n > 0 ? clampPct(n, 0, 100) : 0;
  }
  function accountDiscountPct(wholesale, categoryDiscount) {
    if (!wholesale || categoryDiscount > 0) return 0;
    return clampPct(wholesale.wholesale_making_charge_discount_percent, -100, 100);
  }
  function accountMarkupPct(wholesale, categoryDiscount) {
    if (!wholesale || categoryDiscount > 0) return 0;
    return Number(wholesale.wholesale_markup_percent ?? 0) || 0;
  }
  function rateRow(live, metalType) {
    const key = (metalType || "").toLowerCase();
    if (!live) return null;
    if (Array.isArray(live)) {
      return live.find((r) => (r.metal_type || "").toLowerCase() === key) ?? null;
    }
    if (typeof live === "object" && live !== null) {
      return live[key] ?? null;
    }
    return null;
  }
  function displayRatePerGram(live, metalType, divisor) {
    const row = rateRow(live, metalType);
    if (!row || divisor <= 0) return 0;
    return Number(row.display_rate || row.sell_rate || 0) / divisor;
  }
  function goldRatePerGramForItem(live, item) {
    const g24 = displayRatePerGram(live, "gold", 10);
    const g22Row = displayRatePerGram(live, "gold_22k", 10);
    const g18Row = displayRatePerGram(live, "gold_18k", 10);
    const g22 = g22Row > 0 ? g22Row : g24 > 0 ? g24 * 0.916 : 0;
    const g18 = g18Row > 0 ? g18Row : g24 > 0 ? g24 * 0.75 : 0;
    const p = purityPct(item);
    if (p >= 99 || p >= 995) return g24;
    if (p >= 90 && p <= 93 || Math.abs(p - 91.6) < 1.5 || p === 916) return g22;
    if (p >= 74 && p <= 76 || Math.abs(p - 75) < 1.5 || p === 750) return g18;
    if (g24 > 0 && p > 0) return g24 * (p / 100);
    return g24 || g22 || g18;
  }
  function ratePerGram(live, metal, item) {
    const m = (metal || "silver").toLowerCase();
    if (!live) return 0;
    if (m.startsWith("silver")) return displayRatePerGram(live, "silver", 1e3);
    if (item) return goldRatePerGramForItem(live, item);
    return displayRatePerGram(live, "gold", 10);
  }
  function netWeight(item) {
    const n = item.net_weight ?? item.net_wt ?? item.weight ?? item.avg_wt ?? 0;
    return Number(n) || 0;
  }
  function parseWastagePercent(item) {
    const raw = item.wastage ?? item.wastage_pct ?? item.wastagePct ?? item["Wastage(%)"];
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(String(raw).replace(/%/g, "").trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function resolveProductWastagePercent(item) {
    if (!item || isFixedPriceCatalogItem(item)) return 0;
    const explicit = parseWastagePercent(item);
    if (explicit != null && explicit > 0) return snapWastagePercent(explicit);
    const net = netWeight(item);
    const gross = Number(item.gross_weight ?? item.grossWeight ?? 0) || 0;
    if (net > 0 && gross > net) {
      return snapWastagePercent(Math.round((gross / net - 1) * 1e4) / 100);
    }
    return 0;
  }
  function snapWastagePercent(pct) {
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    const rounded = Math.round(pct);
    if (Math.abs(pct - rounded) <= 0.05) return rounded;
    return Math.round(pct * 100) / 100;
  }
  function metalBillableWeight(item) {
    const net = netWeight(item);
    const w = resolveProductWastagePercent(item);
    if (w > 0 && net > 0) return net * (1 + w / 100);
    const gross = Number(item.gross_weight ?? item.grossWeight ?? 0) || 0;
    if (gross > net && gross > 0) return gross;
    return net;
  }
  function billableWeight(item) {
    const net = netWeight(item);
    const bill = metalBillableWeight(item);
    if (bill > net) return Math.round(bill * 1e3) / 1e3;
    return net;
  }
  function goldStorefrontTotal(preGstBase, gstPct) {
    return Math.round(preGstBase * (1 + gstPct / 100));
  }
  function isDiamondItem(item) {
    const mt = (item?.metal_type ?? "").toString().toLowerCase();
    return mt.startsWith("diamond") || mt.includes("diamond");
  }
  function isGiftingItem(item) {
    const mt = (item?.metal_type ?? "").toString().toLowerCase();
    return mt.startsWith("gifting") || mt.includes("gifting") || mt.startsWith("gift item") || mt === "gift items" || mt === "gift item";
  }
  function isFixedPriceCatalogItem(item) {
    return isDiamondItem(item) || isGiftingItem(item);
  }
  function resolveItemGstRate(item, gstRate, pricingOptions) {
    if (isGiftingItem(item) && pricingOptions?.giftingGstEnabled === false) return 0;
    return Number(gstRate ?? item.gst_rate ?? 3) || 3;
  }
  function purityPct(item) {
    const p = Number(item.purity || 0);
    if (!p || p <= 0) return 0;
    if (p >= 100) return p / 10;
    if (p > 1) return p;
    return p * 100;
  }
  function silverEffectivePurityPct(purity) {
    if (!purity || purity <= 0) return 100;
    if (purity >= 74 && purity <= 76 || Math.abs(purity - 75) < 1.5) return 75;
    if (purity >= 90 && purity <= 100) return 100;
    if (purity >= 79 && purity <= 81 || Math.abs(purity - 80) < 1.5) return 100;
    return purity;
  }
  function normalizeMcType(raw) {
    if (raw == null || String(raw).trim() === "") return null;
    const t = String(raw).trim().toUpperCase().replace(/\s+/g, "");
    if (t === "MC/PC" || t === "MCPC" || t === "PER_PIECE" || t === "PERPIECE" || t === "PIECE" || t === "FIXED") {
      return "MC/PC";
    }
    if (t === "MC/GM" || t === "MCGM" || t === "PER_GRAM" || t === "PERGRAM") {
      return "MC/GM";
    }
    return String(raw).trim().toUpperCase();
  }
  function isMcPerPiece(mcType) {
    return normalizeMcType(mcType) === "MC/PC";
  }
  function linePieceCount(item) {
    const n = Number(item.pcs ?? 1);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 9999) : 1;
  }
  function mcAmount(item) {
    const val = Number(item.mc_rate ?? item.mc_value ?? 0) || 0;
    const pcs = linePieceCount(item);
    if (isMcPerPiece(item.mc_type)) return val * pcs;
    const wt = netWeight(item);
    return wt * val * pcs;
  }
  function stone(item) {
    return Number(item.stone_charges || 0) || 0;
  }
  function goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, mcPart2, stoneAmt) {
    if (mcPart2 === 0 && stoneAmt === 0 && wastagePct > 0) {
      return Math.round(
        netWt * metalRate * (100 + wastagePct) * (100 + gstPct) / 1e4
      );
    }
    const metalPart = Math.floor(netWt * metalRate * (100 + wastagePct) / 100);
    return goldStorefrontTotal(metalPart + mcPart2 + stoneAmt, gstPct);
  }
  function attachWastageFields(item, isGold, netWt, metalRate, metalPart, row) {
    if (!isGold || isFixedPriceCatalogItem(item)) return row;
    const w = resolveProductWastagePercent(item);
    const netMetal = Math.floor(netWt * metalRate);
    const wastageAmount = Math.max(0, metalPart - netMetal);
    const billable = metalBillableWeight(item);
    return {
      ...row,
      billable_weight_gm: billable,
      net_metal: netMetal,
      wastage_pct: w > 0 ? w : void 0,
      wastage_weight_gm: w > 0 ? Math.max(0, billable - netWt) : void 0,
      wastage_amount: wastageAmount > 0 ? wastageAmount : void 0
    };
  }
  function calculateBreakdown(item, liveRates, gstRate, wholesale, pricingOptions) {
    const metal = (item.metal_type || "silver").toLowerCase();
    const wIn = wholesale && wholesaleIsActive(wholesale) ? wholesale : null;
    if (isFixedPriceCatalogItem(item)) {
      const fixedPrice = Number(item.fixed_price ?? 0) || 0;
      const mcRate = Number(item.mc_rate ?? 0) || 0;
      const stoneAmt2 = Number(item.stone_charges ?? 0) || 0;
      const basePrice = fixedPrice > 0 ? fixedPrice : mcRate + stoneAmt2;
      const categoryDisc2 = categoryDiscountPct(item);
      const gstPct = resolveItemGstRate(item, gstRate, pricingOptions);
      if (categoryDisc2 > 0) {
        const taxable3 = basePrice * (1 - categoryDisc2 / 100);
        const gstAmt2 = taxable3 * (gstPct / 100);
        const total3 = taxable3 + gstAmt2;
        const originalTotal = basePrice * (1 + gstPct / 100);
        return {
          metal: 0,
          mc: 0,
          stone: 0,
          cgst: gstAmt2 / 2,
          sgst: gstAmt2 / 2,
          taxable: taxable3,
          total: total3,
          originalTotal,
          discountPercent: categoryDisc2,
          wholesale_retail_total: void 0,
          is_wholesale_price: false
        };
      }
      const markup2 = accountMarkupPct(wIn, 0);
      const acctDisc2 = accountDiscountPct(wIn, 0);
      let taxable2 = basePrice * (1 + markup2 / 100);
      const gstAmt = taxable2 * (gstPct / 100);
      const totalBeforeDiscount2 = taxable2 + gstAmt;
      const total2 = acctDisc2 > 0 ? totalBeforeDiscount2 * (1 - acctDisc2 / 100) : totalBeforeDiscount2;
      const retailTotal = basePrice * (1 + gstPct / 100);
      const wholesaleActive2 = !!wIn && (acctDisc2 > 0 || Math.abs(markup2) > 1e-6);
      return {
        metal: 0,
        mc: 0,
        stone: 0,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        taxable: taxable2,
        total: total2,
        originalTotal: acctDisc2 > 0 ? totalBeforeDiscount2 : void 0,
        discountPercent: acctDisc2 > 0 ? acctDisc2 : void 0,
        wholesale_retail_total: wholesaleActive2 ? retailTotal : void 0,
        is_wholesale_price: wholesaleActive2
      };
    }
    const netWt = netWeight(item);
    const purity = purityPct(item);
    const isSilver = metal.startsWith("silver");
    const isGold = !isSilver && !isFixedPriceCatalogItem(item);
    const billWt = isGold || isSilver ? metalBillableWeight(item) : billableWeight(item);
    const rate = ratePerGram(liveRates, metal, isGold ? item : void 0);
    if ((isGold || isSilver) && rate > 0 && netWt > 0 && billWt > 0) {
      const effectivePurity = isSilver ? silverEffectivePurityPct(purity) : isGold ? 100 : purity;
      const metalRate = isGold ? rate : rate * (effectivePurity > 0 ? effectivePurity / 100 : 1);
      const wastagePct = isGold ? resolveProductWastagePercent(item) : 0;
      const pcs = linePieceCount(item);
      const metalPart = isGold ? Math.floor(netWt * metalRate * (100 + wastagePct) / 100) * pcs : metalRate * billWt * pcs;
      const mcPartVal = isGold ? Math.round(mcAmount(item)) : mcAmount(item);
      const stoneAmt2 = (isGold ? Math.round(stone(item)) : stone(item)) * pcs;
      const baseRetail2 = metalPart + mcPartVal + stoneAmt2;
      const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3;
      const categoryDisc2 = categoryDiscountPct(item);
      if (categoryDisc2 > 0) {
        const totalBeforeDiscount3 = isGold ? goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, mcPartVal, stoneAmt2) : baseRetail2 * (1 + gstPct / 100);
        const total3 = totalBeforeDiscount3 * (1 - categoryDisc2 / 100);
        const gstAmt2 = totalBeforeDiscount3 - baseRetail2;
        return attachWastageFields(item, isGold, netWt, metalRate, metalPart, {
          metal: metalPart,
          mc: mcPartVal,
          stone: stoneAmt2,
          cgst: gstAmt2 / 2,
          sgst: gstAmt2 / 2,
          taxable: baseRetail2,
          total: total3,
          originalTotal: totalBeforeDiscount3,
          discountPercent: categoryDisc2,
          rate_per_gram: metalRate,
          net_weight: netWt,
          wholesale_retail_total: void 0,
          is_wholesale_price: false
        });
      }
      const markup2 = accountMarkupPct(wIn, 0);
      const acctDisc2 = accountDiscountPct(wIn, 0);
      const base = baseRetail2 * (1 + markup2 / 100);
      const useGoldTagFormula = isGold && !wIn && Math.abs(markup2) < 1e-6 && mcPartVal === 0 && stoneAmt2 === 0;
      const totalBeforeDiscount2 = isGold ? useGoldTagFormula ? goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, 0, 0) : goldStorefrontTotal(base, gstPct) : base * (1 + gstPct / 100);
      const total2 = acctDisc2 > 0 ? totalBeforeDiscount2 * (1 - acctDisc2 / 100) : totalBeforeDiscount2;
      const retailBeforePromo2 = isGold ? mcPartVal === 0 && stoneAmt2 === 0 ? goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, 0, 0) : goldStorefrontTotal(baseRetail2, gstPct) : baseRetail2 * (1 + gstPct / 100);
      const gstAmt = totalBeforeDiscount2 - base;
      const wholesaleActive2 = !!wIn && (acctDisc2 > 0 || Math.abs(markup2) > 1e-6);
      return attachWastageFields(item, isGold, netWt, metalRate, metalPart, {
        metal: metalPart,
        mc: mcPartVal,
        stone: stoneAmt2,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        taxable: base,
        total: total2,
        originalTotal: acctDisc2 > 0 ? totalBeforeDiscount2 : void 0,
        discountPercent: acctDisc2 > 0 ? acctDisc2 : void 0,
        rate_per_gram: metalRate,
        net_weight: netWt,
        wholesale_retail_total: wholesaleActive2 ? retailBeforePromo2 : void 0,
        is_wholesale_price: wholesaleActive2
      });
    }
    const wt = billWt > 0 ? billWt : netWt;
    const metalVal = wt * rate * (purity / 100);
    const mc = mcAmount(item);
    const stoneAmt = stone(item);
    const gst = Number(gstRate ?? item.gst_rate ?? 0) || 0;
    const categoryDisc = categoryDiscountPct(item);
    const baseRetail = metalVal + mc + stoneAmt;
    if (categoryDisc > 0) {
      const retailCgst2 = gst ? baseRetail * (gst / 200) : 0;
      const retailSgst2 = gst ? baseRetail * (gst / 200) : 0;
      const retailBeforePromo2 = baseRetail + retailCgst2 + retailSgst2;
      const total2 = retailBeforePromo2 * (1 - categoryDisc / 100);
      return {
        metal: metalVal,
        mc,
        stone: stoneAmt,
        cgst: retailCgst2,
        sgst: retailSgst2,
        taxable: baseRetail,
        total: total2,
        originalTotal: retailBeforePromo2,
        discountPercent: categoryDisc,
        rate_per_gram: wt > 0 ? rate * (purity / 100) : 0,
        net_weight: wt,
        wholesale_retail_total: void 0,
        is_wholesale_price: false
      };
    }
    const markup = accountMarkupPct(wIn, 0);
    const acctDisc = accountDiscountPct(wIn, 0);
    let taxable = baseRetail * (1 + markup / 100);
    const cgst = gst ? taxable * (gst / 200) : 0;
    const sgst = gst ? taxable * (gst / 200) : 0;
    const totalBeforeDiscount = taxable + cgst + sgst;
    const total = acctDisc > 0 ? totalBeforeDiscount * (1 - acctDisc / 100) : totalBeforeDiscount;
    const retailCgst = gst ? baseRetail * (gst / 200) : 0;
    const retailSgst = gst ? baseRetail * (gst / 200) : 0;
    const retailBeforePromo = baseRetail + retailCgst + retailSgst;
    const wholesaleActive = !!wIn && (acctDisc > 0 || Math.abs(markup) > 1e-6);
    return {
      metal: metalVal,
      mc,
      stone: stoneAmt,
      cgst,
      sgst,
      taxable,
      total,
      originalTotal: acctDisc > 0 ? totalBeforeDiscount : void 0,
      discountPercent: acctDisc > 0 ? acctDisc : void 0,
      rate_per_gram: wt > 0 ? rate * (purity / 100) : 0,
      net_weight: wt,
      wholesale_retail_total: wholesaleActive ? retailBeforePromo : void 0,
      is_wholesale_price: wholesaleActive
    };
  }

  // src/lib/catalog-slab-pricing.ts
  function clampPct2(n, lo = 0, hi = 100) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.max(lo, Math.min(hi, v));
  }
  function clampMarginPct(n) {
    return clampPct2(n, 0, 1e3);
  }
  function applySlabMarginToBreakdown(b, marginPct) {
    const m = clampMarginPct(marginPct);
    if (m <= 0) return b;
    const factor = 1 + m / 100;
    const total = Math.round(b.total * factor);
    const taxable = b.taxable != null && Number.isFinite(b.taxable) ? Math.round(b.taxable * factor) : b.taxable;
    const gstAmt = taxable != null ? total - taxable : void 0;
    return {
      ...b,
      total,
      taxable,
      cgst: gstAmt != null ? gstAmt / 2 : b.cgst,
      sgst: gstAmt != null ? gstAmt / 2 : b.sgst,
      originalTotal: b.originalTotal != null && Number.isFinite(b.originalTotal) ? Math.round(b.originalTotal * factor) : b.originalTotal
    };
  }
  function parseResellerSlabSettings(raw) {
    if (!raw || typeof raw !== "object") return {};
    const o = raw;
    const tier = (key) => {
      const t = o[key];
      if (!t || typeof t !== "object") return void 0;
      const row = t;
      return {
        mc_discount_pct: clampPct2(row.mc_discount_pct, 0, 100),
        mc_gm_discount_pct: clampPct2(row.mc_gm_discount_pct, 0, 100),
        silver_rate_offset_per_g: Math.max(0, Number(row.silver_rate_offset_per_g) || 0),
        gold_rate_offset_per_g: Math.max(0, Number(row.gold_rate_offset_per_g) || 0),
        wastage_discount_pct: clampPct2(row.wastage_discount_pct, 0, 100),
        gift_discount_pct: clampPct2(row.gift_discount_pct, 0, 100),
        margin_pct: clampMarginPct(row.margin_pct)
      };
    };
    return {
      slab_r: tier("slab_r"),
      slab_w: tier("slab_w"),
      slab_f: tier("slab_f"),
      gold_slab_r: tier("gold_slab_r"),
      gold_slab_w: tier("gold_slab_w"),
      gold_slab_f: tier("gold_slab_f")
    };
  }
  function isGoldMetalType(metalType) {
    return String(metalType || "").toLowerCase().startsWith("gold");
  }
  function tierSettingsForSlab(settings, kind, metalType) {
    const gold = isGoldMetalType(metalType);
    if (kind === "slab_r") return (gold ? settings.gold_slab_r : settings.slab_r) ?? {};
    if (kind === "slab_w") return (gold ? settings.gold_slab_w : settings.slab_w) ?? {};
    if (kind === "slab_f") return (gold ? settings.gold_slab_f : settings.slab_f) ?? {};
    return {};
  }
  function rateRow2(live, metalType) {
    const key = (metalType || "").toLowerCase();
    if (!live) return null;
    if (Array.isArray(live)) {
      return live.find(
        (r) => (r.metal_type || "").toLowerCase() === key
      ) ?? null;
    }
    if (typeof live === "object" && live !== null) {
      return live[key] ?? null;
    }
    return null;
  }
  function liveSilver999PerGram(rates) {
    const row = rateRow2(rates, "silver");
    if (!row) return 0;
    return Number(row.display_rate ?? row.sell_rate ?? 0) / 1e3;
  }
  function liveGold24PerGram(rates) {
    const row = rateRow2(rates, "gold");
    if (!row) return 0;
    return Number(row.display_rate ?? row.sell_rate ?? 0) / 10;
  }
  function goldRateForItem(live, item) {
    const g24 = liveGold24PerGram(live);
    const g22Row = rateRow2(live, "gold_22k");
    const g18Row = rateRow2(live, "gold_18k");
    const g22 = g22Row && Number(g22Row.display_rate ?? g22Row.sell_rate) ? Number(g22Row.display_rate ?? g22Row.sell_rate) / 10 : g24 > 0 ? g24 * 0.916 : 0;
    const g18 = g18Row && Number(g18Row.display_rate ?? g18Row.sell_rate) ? Number(g18Row.display_rate ?? g18Row.sell_rate) / 10 : g24 > 0 ? g24 * 0.75 : 0;
    const p = purityPct(item);
    if (p >= 99 || p >= 99.5) return g24;
    if (p >= 90 && p <= 93 || Math.abs(p - 91.6) < 1.5) return g22;
    if (p >= 74 && p <= 76 || Math.abs(p - 75) < 1.5) return g18;
    if (g24 > 0 && p > 0) return g24 * (p / 100);
    return g24 || g22 || g18;
  }
  function silverEffectivePurity(purity) {
    return silverEffectivePurityPct(purity);
  }
  function resolveMcDiscountPct(item, settings) {
    if (isMcPerPiece(item.mc_type)) {
      return clampPct2(settings.mc_discount_pct, 0, 100);
    }
    const gm = settings.mc_gm_discount_pct;
    if (gm != null && Number.isFinite(Number(gm))) {
      return clampPct2(gm, 0, 100);
    }
    return clampPct2(settings.mc_discount_pct, 0, 100);
  }
  function mcPart(item, mcDiscountPct) {
    const val = Number(item.mc_rate ?? item.mc_value ?? 0) || 0;
    const wt = netWeight(item);
    const pcs = linePieceCount(item);
    const raw = isMcPerPiece(item.mc_type) ? val * pcs : wt * val * pcs;
    const disc = clampPct2(mcDiscountPct, 0, 100);
    return raw * (1 - disc / 100);
  }
  function stonePart(item) {
    return Number(item.stone_charges || 0) || 0;
  }
  function effectiveGoldWastagePct(item, wastageDiscountPts) {
    let w = resolveProductWastagePercent(item);
    if (w > 0 && wastageDiscountPts > 0) {
      w = snapWastagePercent(Math.max(0, w - clampPct2(wastageDiscountPts, 0, 100)));
    }
    return w;
  }
  function billableWithSlabWastage(item, wastageDiscountPct) {
    const net = netWeight(item);
    if (net <= 0) return net;
    let w = resolveProductWastagePercent(item);
    if (w > 0 && wastageDiscountPct > 0) {
      w = snapWastagePercent(Math.max(0, w - clampPct2(wastageDiscountPct, 0, 100)));
    }
    if (w > 0) return net * (1 + w / 100);
    const gross = Number(item.gross_weight ?? 0) || 0;
    if (gross > net) return gross;
    return net;
  }
  function resolveFineMetalRatePerG(item, rates, slab) {
    const metal = String(item.metal_type || "silver").toLowerCase();
    const isSilver = metal.startsWith("silver");
    if (slab.kind === "slab_r" && isSilver) {
      const live = liveSilver999PerGram(rates);
      const offset = Math.max(0, Number(slab.settings.silver_rate_offset_per_g) || 0);
      return Math.max(0, live - offset);
    }
    if (slab.kind === "slab_r" && metal.startsWith("gold")) {
      const live = goldRateForItem(rates, item);
      const offset = Math.max(0, Number(slab.settings.gold_rate_offset_per_g) || 0);
      return Math.max(0, live - offset);
    }
    if (slab.kind === "slab_w" || slab.kind === "slab_f") {
      if (isSilver) {
        const wr = Number(slab.wholesaleSilverRatePerG);
        if (Number.isFinite(wr) && wr > 0) return wr;
      } else if (metal.startsWith("gold")) {
        const wr = Number(slab.wholesaleGoldRatePerG);
        if (Number.isFinite(wr) && wr > 0) return wr;
      }
    }
    if (isSilver) return liveSilver999PerGram(rates);
    return goldRateForItem(rates, item);
  }
  function calculateBreakdownWithSlab(item, rates, gstRate, slab, wholesale, pricingOptions) {
    const gst = resolveItemGstRate(item, gstRate, pricingOptions);
    const kind = slab?.kind ?? "standard";
    if (!slab || kind === "standard") {
      return calculateBreakdown(item, rates, gst, wholesale ?? void 0, pricingOptions);
    }
    const settings = slab.allSettings ? tierSettingsForSlab(slab.allSettings, kind, item.metal_type) : slab.settings ?? {};
    const effectiveSlab = { ...slab, settings };
    const mcDisc = resolveMcDiscountPct(item, settings);
    const giftDisc = clampPct2(settings.gift_discount_pct, 0, 100);
    const finish = (b) => applySlabMarginToBreakdown(b, settings.margin_pct);
    if (isFixedPriceCatalogItem(item)) {
      const base = calculateBreakdown(item, rates, gst, null, pricingOptions);
      if (giftDisc <= 0) return finish(base);
      const total = Math.round(base.total * (1 - giftDisc / 100));
      return finish({
        ...base,
        total,
        originalTotal: base.total,
        discountPercent: giftDisc
      });
    }
    const metal = String(item.metal_type || "silver").toLowerCase();
    const isSilver = metal.startsWith("silver");
    const isGold = !isSilver && !metal.startsWith("diamond") && !isGiftingItem(item);
    if (!isGold && !isSilver) {
      return calculateBreakdown(item, rates, gst, wholesale ?? void 0, pricingOptions);
    }
    const netWt = netWeight(item);
    const purity = purityPct(item);
    const wastageDiscPts = clampPct2(settings.wastage_discount_pct, 0, 100);
    const wastageDiscForBillWt = kind === "slab_f" ? wastageDiscPts : 0;
    const billWt = kind === "slab_f" && wastageDiscForBillWt > 0 ? billableWithSlabWastage(item, wastageDiscForBillWt) : metalBillableWeight(item);
    const fineRate = resolveFineMetalRatePerG(item, rates, effectiveSlab);
    if (fineRate <= 0 || netWt <= 0 || billWt <= 0) {
      return calculateBreakdown(item, rates, gst, wholesale ?? void 0, pricingOptions);
    }
    const effPurity = isSilver ? silverEffectivePurity(purity) : 100;
    const metalRate = isGold ? fineRate : fineRate * (effPurity / 100);
    let metalPart;
    let mc;
    let stone2;
    let wastagePctVal = 0;
    let wastageAmount;
    let mcBeforeDiscount;
    const pcs = linePieceCount(item);
    if (isGold && kind === "slab_r" && slab.goldSlabRUseMcPricing !== false) {
      const effectiveWastage = effectiveGoldWastagePct(item, wastageDiscPts);
      metalPart = Math.floor(netWt * metalRate) * pcs;
      const wastageAsMc = Math.floor(netWt * metalRate * effectiveWastage / 100) * pcs;
      const itemMcRaw = Math.round(mcPart(item, 0));
      mcBeforeDiscount = wastageAsMc + itemMcRaw;
      mc = mcDisc > 0 ? Math.round(mcBeforeDiscount * (1 - mcDisc / 100)) : mcBeforeDiscount;
      stone2 = Math.round(stonePart(item)) * pcs;
    } else if (isGold) {
      wastagePctVal = effectiveGoldWastagePct(
        item,
        kind === "slab_w" || kind === "slab_f" ? wastageDiscPts : 0
      );
      metalPart = Math.floor(netWt * metalRate * (100 + wastagePctVal) / 100) * pcs;
      const mcRaw = Math.round(mcPart(item, 0));
      mc = mcDisc > 0 ? Math.round(mcRaw * (1 - mcDisc / 100)) : mcRaw;
      if (mcDisc > 0 && mcRaw > mc) mcBeforeDiscount = mcRaw;
      wastageAmount = Math.max(0, metalPart - Math.floor(netWt * metalRate) * pcs);
      stone2 = Math.round(stonePart(item)) * pcs;
    } else {
      metalPart = metalRate * billWt * pcs;
      const mcRaw = mcPart(item, 0);
      mc = mcPart(item, mcDisc);
      if (mcDisc > 0 && mcRaw > mc) mcBeforeDiscount = Math.round(mcRaw);
      stone2 = stonePart(item) * pcs;
    }
    const baseRetail = metalPart + mc + stone2;
    const gstPct = gst;
    const categoryDisc = Number(item.discount_percentage || 0) || 0;
    if (categoryDisc > 0) {
      const totalBeforeDiscount2 = isGold ? goldStorefrontTotal(baseRetail, gstPct) : baseRetail * (1 + gstPct / 100);
      const total = totalBeforeDiscount2 * (1 - categoryDisc / 100);
      const gstAmt2 = totalBeforeDiscount2 - baseRetail;
      return finish({
        metal: metalPart,
        mc,
        stone: stone2,
        cgst: gstAmt2 / 2,
        sgst: gstAmt2 / 2,
        taxable: baseRetail,
        total,
        originalTotal: totalBeforeDiscount2,
        discountPercent: categoryDisc,
        rate_per_gram: metalRate,
        net_weight: netWt,
        billable_weight_gm: billWt,
        wastage_pct: isGold && wastagePctVal > 0 ? wastagePctVal : void 0,
        wastage_amount: wastageAmount
      });
    }
    const totalBeforeDiscount = isGold ? goldStorefrontTotal(baseRetail, gstPct) : Math.round(baseRetail * (1 + gstPct / 100));
    const gstAmt = totalBeforeDiscount - baseRetail;
    return finish({
      metal: metalPart,
      mc,
      stone: stone2,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable: baseRetail,
      total: totalBeforeDiscount,
      rate_per_gram: metalRate,
      net_weight: netWt,
      billable_weight_gm: billWt,
      wastage_pct: isGold && wastagePctVal > 0 ? wastagePctVal : void 0,
      wastage_amount: wastageAmount,
      mc_before_discount: mcBeforeDiscount != null && mcBeforeDiscount > mc ? mcBeforeDiscount : void 0,
      mc_discount_pct: mcBeforeDiscount != null && mcBeforeDiscount > mc && mcDisc > 0 ? mcDisc : void 0
    });
  }

  // src/lib/erp-piece-slab-pricing.ts
  function parseMetalSlabFraction(raw) {
    if (raw == null || raw === "") return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    if (n > 1) return Math.min(1, Math.max(0, n / 100));
    if (n > 0 && n <= 1) return n;
    return 1;
  }
  function lineHasPieceSlabFields(line) {
    return line.mc_rate_slab_r != null || line.mc_rate_slab_w != null || line.mc_rate_slab_f != null || line.metal_slab_r_pct != null || line.metal_slab_w_pct != null || line.metal_slab_f_pct != null;
  }
  function pieceSlabMcRate(line, slab) {
    if (slab === "W") {
      if (line.mc_rate_slab_w != null && Number.isFinite(Number(line.mc_rate_slab_w))) {
        return Number(line.mc_rate_slab_w);
      }
      if (line.manualEntry) return null;
      return line.mc_rate_slab_r ?? line.mc_rate ?? null;
    }
    if (slab === "F") {
      if (line.mc_rate_slab_f != null && Number.isFinite(Number(line.mc_rate_slab_f))) {
        return Number(line.mc_rate_slab_f);
      }
      if (line.manualEntry) return null;
      return line.mc_rate_slab_w ?? line.mc_rate ?? null;
    }
    return line.mc_rate_slab_r ?? line.mc_rate ?? null;
  }
  function pieceSlabMetalFraction(line, slab) {
    if (slab === "W") {
      return parseMetalSlabFraction(line.metal_slab_w_pct ?? line.metal_slab_r_pct ?? 1);
    }
    if (slab === "F") {
      return parseMetalSlabFraction(line.metal_slab_f_pct ?? line.metal_slab_w_pct ?? 1);
    }
    return parseMetalSlabFraction(line.metal_slab_r_pct ?? 1);
  }
  function pieceSlabBillableWeight(line, slab) {
    const net = line.originalWeightGm ?? line.weightGm ?? 0;
    if (net <= 0) return 0;
    const frac = pieceSlabMetalFraction(line, slab);
    return Math.round(net * frac * 1e3) / 1e3;
  }
  function resolveErpSilverMetalRatePerG(slab, silverPerG, wholesaleSilver, silverRateOffsetPerG = 0) {
    const offset = Math.max(0, Number(silverRateOffsetPerG) || 0);
    if (slab === "R") return Math.max(0, silverPerG - offset);
    const wh = wholesaleSilver ?? silverPerG;
    return Math.max(0, wh);
  }
  function resolveErpLineSilverMetalRatePerG(line, slab, silverPerG, wholesaleSilver, silverRateOffsetPerG = 0) {
    const explicit = Number(line.ratePerGram);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const locked = Number(line.ratePerGram);
    if (line.rateLocked && Number.isFinite(locked) && locked > 0) return locked;
    return resolveErpSilverMetalRatePerG(
      slab,
      silverPerG,
      wholesaleSilver,
      silverRateOffsetPerG
    );
  }
  function applyPieceSlabToLine(line, slab) {
    if (!lineHasPieceSlabFields(line)) return line;
    const net = line.originalWeightGm ?? line.weightGm ?? null;
    return {
      ...line,
      originalWeightGm: net,
      weightGm: pieceSlabBillableWeight(line, slab)
    };
  }
  function computeErpPieceSlabBreakdown(line, slab, silverPerG, wholesaleSilver, gstPct = 3, silverRateOffsetPerG = 0, mcDiscountPct = 0) {
    const netWt = line.originalWeightGm ?? line.weightGm ?? 0;
    const billWt = pieceSlabBillableWeight(line, slab);
    const metalRate = resolveErpLineSilverMetalRatePerG(
      line,
      slab,
      silverPerG,
      wholesaleSilver,
      silverRateOffsetPerG
    );
    const mcRate = Number(pieceSlabMcRate(line, slab) ?? 0) || 0;
    const qty = line.qty ?? 1;
    const stone2 = Number(line.stone_charges || 0) || 0;
    const box = Number(line.box_charges || 0) || 0;
    const mcGm = !isMcPerPiece(line.mc_type);
    let metalPart;
    let mc;
    const mcDisc = Math.max(0, Math.min(100, Number(mcDiscountPct) || 0));
    if (mcGm) {
      metalPart = Math.round(metalRate * billWt);
      mc = Math.round(mcRate * netWt);
      if (mcDisc > 0) mc = Math.round(mc * (1 - mcDisc / 100));
    } else {
      metalPart = Math.round(metalRate * billWt);
      const mcRaw = Math.round(mcRate * qty);
      mc = mcDisc > 0 ? Math.round(mcRaw * (1 - mcDisc / 100)) : mcRaw;
    }
    const taxable = metalPart + mc + stone2 + box;
    const total = Math.round(taxable * (1 + gstPct / 100));
    const gstAmt = total - taxable;
    return {
      metal: metalPart,
      mc,
      stone: stone2,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable,
      total,
      rate_per_gram: metalRate,
      net_weight: netWt,
      billable_weight_gm: billWt
    };
  }

  // src/lib/erp-mc-type-field.ts
  function normalizeMcTypeInput(raw) {
    const t = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
    if (!t) return null;
    if (t.includes("/pc") || t.includes("perpc") || t.includes("mcpc") || t.includes("piece")) {
      return "mc/pc";
    }
    if (t.includes("/gm") || t.includes("pergm") || t.includes("mcgm") || t === "mc") {
      return "mc/gm";
    }
    return "mc/gm";
  }
  function isMcPerGmBillingType(mcType) {
    return normalizeMcTypeInput(mcType) === "mc/gm";
  }

  // src/lib/erp-catalog-product.ts
  function resolveDesignFinishOptions(product) {
    const opts = (product?.finish_options || []).filter((o) => String(o.label || "").trim());
    if (opts.length < 2) return void 0;
    const multiSize = (product?.sizes?.length || 0) >= 2;
    if (multiSize) {
      const hasChargeOrMrp = opts.some(
        (o) => (Number(o.stone_charges) || 0) > 0 || o.fixed_price != null && Number(o.fixed_price) > 0
      );
      if (!hasChargeOrMrp) return void 0;
      const sig = new Set(
        opts.map((o) => `${String(o.label).trim().toUpperCase()}|${o.stone_charges}|${o.fixed_price ?? ""}`)
      );
      if (sig.size < 2) return void 0;
    }
    return opts;
  }
  function lineHasFinishPicker(line) {
    return (line.designFinishOptions?.length ?? 0) >= 2;
  }
  function catalogProductUsesMrpPricing(product) {
    const mt = String(product.metal_type || "").toLowerCase();
    if (isGiftingItem({ metal_type: mt })) return true;
    const hasWeight = (product.net_weight ?? 0) > 0 || (product.sizes || []).some((s) => (s.net_weight ?? 0) > 0);
    if (hasWeight && mt.startsWith("silver")) return false;
    return (product.fixed_price ?? 0) > 0;
  }
  function findCatalogProduct(catalog, name) {
    const q = name.trim().toUpperCase();
    if (!q || !catalog?.length) return null;
    return catalog.find((p) => p.name.trim().toUpperCase() === q) ?? null;
  }
  function isGoldStockLine(line) {
    if (line.stock_piece_id != null) return true;
    const metal = String(line.metal_type || "").toLowerCase();
    return metal.startsWith("gold") && !line.manualEntry;
  }
  function shouldKeepCatalogWeights(line, mrpMode) {
    if (isGoldStockLine(line)) return true;
    if (mrpMode) return true;
    return false;
  }
  function patchLineFromCatalogProduct(line, product) {
    const mrpMode = catalogProductUsesMrpPricing(product);
    const patch = {
      name: product.name,
      imageUrl: product.image_url ?? line.imageUrl ?? null,
      mc_rate: product.mc_rate ?? line.mc_rate,
      mc_type: normalizeMcTypeInput(product.mc_type) ?? line.mc_type,
      wastage_pct: product.wastage_pct ?? line.wastage_pct,
      purity: product.purity ?? line.purity,
      metal_type: line.manualCategory === "gift" ? null : product.metal_type ?? line.metal_type ?? "silver",
      fixed_price: product.fixed_price ?? line.fixed_price,
      designSizeOptions: (product.sizes || []).length ? (product.sizes || []).map((s) => ({
        size_label: s.size_label,
        fixed_price_mrp: s.fixed_price ?? null
      })) : void 0,
      designBoxOptions: (product.box_options?.length || 0) >= 2 ? product.box_options : void 0,
      designFinishOptions: resolveDesignFinishOptions(product),
      size: null,
      /** Weight stays blank for silver weight-based lines so the cashier enters net wt. */
      weightGm: null,
      originalWeightGm: null,
      gross_weight: null,
      box_charges: (product.box_options?.length || 0) >= 2 ? null : product.box_options?.[0]?.box_charges ?? 0,
      packaging_label: (product.box_options?.length || 0) >= 2 ? null : void 0,
      finish_label: (product.finish_options?.length || 0) >= 2 ? null : void 0,
      stone_charges: product.stone_charges ?? 0,
      mrpMode: mrpMode || void 0
    };
    const multiFinish = resolveDesignFinishOptions(product) != null;
    if (multiFinish) {
      patch.fixed_price = null;
      patch.unitInr = null;
      patch.mrpListPrice = null;
      patch.mrpMode = true;
    }
    if (product.sizes?.length === 1) {
      const s = product.sizes[0];
      patch.size = s.size_label;
      if (shouldKeepCatalogWeights(line, mrpMode) && s.net_weight != null) {
        patch.weightGm = s.net_weight;
        patch.originalWeightGm = s.net_weight;
      }
      if (shouldKeepCatalogWeights(line, mrpMode) && s.gross_weight != null) {
        patch.gross_weight = s.gross_weight;
      }
      if (s.mc_rate != null) patch.mc_rate = s.mc_rate;
      if (s.mc_type) patch.mc_type = s.mc_type;
      if (s.wastage_pct != null) patch.wastage_pct = s.wastage_pct;
      if (s.purity != null) patch.purity = s.purity;
      if (s.fixed_price != null) {
        patch.fixed_price = s.fixed_price;
        patch.mrpListPrice = s.fixed_price;
        patch.mrpMode = true;
      }
      if (s.mc_rate_slab_r != null) patch.mc_rate_slab_r = s.mc_rate_slab_r;
      if (s.mc_rate_slab_w != null) patch.mc_rate_slab_w = s.mc_rate_slab_w;
      if (s.mc_rate_slab_f != null) patch.mc_rate_slab_f = s.mc_rate_slab_f;
    }
    if (product.finish_options?.length === 1) {
      const f = product.finish_options[0];
      patch.stone_charges = f.stone_charges ?? 0;
      patch.finish_label = f.label;
      if (f.fixed_price != null) {
        patch.mrpListPrice = f.fixed_price;
        patch.mrpMode = true;
      }
    }
    if (product.box_options?.length === 1) {
      const b = product.box_options[0];
      patch.box_charges = b.box_charges ?? 0;
      patch.packaging_label = b.label;
    }
    if (patch.mrpMode && patch.fixed_price != null && patch.mrpListPrice == null) {
      patch.mrpListPrice = Number(patch.fixed_price);
    }
    return patch;
  }
  function nextFieldAfterCatalogProduct(product) {
    if ((product.sizes?.length || 0) > 1) return "size";
    return nextFieldAfterCatalogSize(product);
  }
  function findDesignOptionLabel(options, label) {
    const q = label.trim().toUpperCase();
    if (!q || !options?.length) return void 0;
    return options.find((o) => o.label.trim().toUpperCase() === q);
  }
  function nextFieldAfterCatalogSize(product) {
    if (catalogProductUsesMrpPricing(product)) {
      if ((product.finish_options?.length || 0) >= 2) return "stone_charges";
      if ((product.box_options?.length || 0) >= 2) return "box_charges";
      return "qty";
    }
    if ((product.finish_options?.length || 0) >= 2) return "stone_charges";
    return "weightGm";
  }
  function patchLineFromCatalogSize(line, product, sizeLabel) {
    const hit = product.sizes?.find((s) => s.size_label === sizeLabel);
    if (!hit) return { size: sizeLabel || null };
    const mrp = catalogProductUsesMrpPricing(product);
    const keepWt = shouldKeepCatalogWeights(line, mrp);
    return {
      size: sizeLabel,
      weightGm: keepWt ? hit.net_weight ?? line.weightGm : null,
      originalWeightGm: keepWt ? hit.net_weight ?? line.originalWeightGm : null,
      gross_weight: keepWt ? hit.gross_weight ?? line.gross_weight : null,
      mc_rate: hit.mc_rate ?? line.mc_rate,
      mc_type: hit.mc_type ?? line.mc_type,
      wastage_pct: hit.wastage_pct ?? line.wastage_pct,
      purity: hit.purity ?? line.purity,
      fixed_price: hit.fixed_price ?? line.fixed_price,
      box_charges: hit.box_charges ?? line.box_charges,
      mc_rate_slab_r: hit.mc_rate_slab_r ?? line.mc_rate_slab_r,
      mc_rate_slab_w: hit.mc_rate_slab_w ?? line.mc_rate_slab_w,
      mc_rate_slab_f: hit.mc_rate_slab_f ?? line.mc_rate_slab_f,
      ...mrp && hit.fixed_price != null ? {
        mrpListPrice: Number(hit.fixed_price),
        mrpMode: true,
        fixed_price: hit.fixed_price,
        unitInr: line.unitInr ?? hit.fixed_price
      } : {}
    };
  }

  // src/lib/erp-metal-slab-field.ts
  function billingShowsMcSlabRColumn(slab) {
    return slab === "R";
  }
  function metalSlabPctStorageKey(slab) {
    if (slab === "W") return "metal_slab_w_pct";
    if (slab === "F") return "metal_slab_f_pct";
    return "metal_slab_r_pct";
  }
  function metalSlabPctUiFromStorage(raw) {
    if (raw == null || raw === "") return null;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return null;
    if (n > 0 && n <= 1) return Math.round(n * 1e4) / 100;
    return n;
  }
  function readMetalSlabPct(line, slab) {
    const key = metalSlabPctStorageKey(slab);
    const ui = metalSlabPctUiFromStorage(line[key]);
    return ui != null ? ui : "";
  }
  function metalSlabPctMultiplier(line, slab) {
    const ui = readMetalSlabPct(line, slab);
    if (ui === "" || ui <= 0) return null;
    return ui / 100;
  }
  function formatMetalSlabPctForDisplay(line, slab) {
    const key = metalSlabPctStorageKey(slab);
    const raw = line[key];
    if (raw == null || raw === "") return "";
    const s = String(raw).trim();
    if (!s) return "";
    if (s.includes("%")) return s;
    const n = Number(s);
    if (!Number.isFinite(n)) return s;
    if (n > 0 && n <= 1) return `${Math.round(n * 1e3) / 10}%`;
    return `${n}%`;
  }
  function lineHasMetalSlabPctInput(line, slab) {
    return formatMetalSlabPctForDisplay(line, slab) !== "";
  }
  function isManualGridFieldVisible(field, line, rateSlab = "R") {
    if (field === "mc_rate_slab_r" && !billingShowsMcSlabRColumn(rateSlab)) return false;
    if (line.manualCategory === "gift" || line.mrpMode) {
      if (field === "ratePerGram" || field === "metal_type") return false;
    }
    if (field === "box_charges") return (line.designBoxOptions?.length ?? 0) >= 2;
    if (field === "stone_charges") return lineHasFinishPicker(line);
    if (field === "fixed_price_r") {
      return line.manualCategory === "gift" || !!line.mrpMode;
    }
    return true;
  }
  function nextVisibleManualEntryField(current, line, order, rateSlab = "R") {
    const idx = order.indexOf(current);
    if (idx < 0) return null;
    for (let i = idx + 1; i < order.length; i += 1) {
      const key = order[i];
      if (isManualGridFieldVisible(key, line, rateSlab)) return key;
    }
    return null;
  }

  // src/lib/erp-manual-as-line-pricing.ts
  var GST_PCT = 3;
  function isManualArticlesOrJewelleryLine(line) {
    if (!line.manualEntry) return false;
    return line.manualCategory === "articles" || line.manualCategory === "jewellery" || line.manualCategory === "bullion";
  }
  function manualMcDiscountPerUnit(line, slab) {
    if (!line.manualEntry) return 0;
    if (slab === "W" || slab === "F") return 0;
    const slabMc = pieceSlabMcRate(line, slab);
    if (slabMc != null && Number(slabMc) > 0) return 0;
    const field = mcSlabFieldForBillingSlab(slab);
    const v = Number(line[field] ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  function manualEffectiveMcRatePerUnit(line, slab) {
    const slabMc = pieceSlabMcRate(line, slab);
    if (slabMc != null && Number(slabMc) > 0) return Number(slabMc);
    const base = Number(line.mc_rate ?? 0) || 0;
    if (base <= 0) return 0;
    const disc = manualMcDiscountPerUnit(line, slab);
    return disc > 0 ? Math.max(0, base - disc) : base;
  }
  function resolveManualRowRatePerG(line, slab, silverPerG, goldPerG, wholesaleSilver, wholesaleGold) {
    const explicit = Number(line.ratePerGram);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const locked = Number(line.ratePerGram);
    if (line.rateLocked && Number.isFinite(locked) && locked > 0) return locked;
    const metal = String(line.metal_type || "silver").toLowerCase();
    if (metal.startsWith("gold")) {
      if (slab === "W" || slab === "F") {
        const wh = Number(wholesaleGold ?? goldPerG) || 0;
        return wh > 0 ? wh : goldPerG > 0 ? goldPerG : 0;
      }
      return goldPerG > 0 ? goldPerG : 0;
    }
    if (slab === "W" || slab === "F") {
      const wh = Number(wholesaleSilver ?? silverPerG) || 0;
      return wh > 0 ? wh : silverPerG > 0 ? silverPerG : 0;
    }
    return silverPerG > 0 ? silverPerG : 0;
  }
  function manualSilverRateDiscountInr(line, slab, billedWt, lineRate, silverPerG) {
    if (slab !== "R") return 0;
    if (Number(line.ratePerGram) > 0) return 0;
    if (lineHasMetalSlabPctInput(line, slab)) return 0;
    if (billedWt <= 0 || silverPerG <= 0 || lineRate <= 0) return 0;
    if (silverPerG <= lineRate) return 0;
    return Math.round((silverPerG - lineRate) * billedWt);
  }
  function computeManualAsLineBreakdown(line, slab, silverPerG = 0, goldPerG = 0, wholesaleSilver, wholesaleGold, gstPct = GST_PCT) {
    const netWt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0;
    if (netWt <= 0) {
      return { metal: 0, mc: 0, stone: 0, cgst: 0, sgst: 0, taxable: 0, total: 0 };
    }
    const wastPct = Number(line.wastage_pct ?? 0) || 0;
    const metalMult = metalSlabPctMultiplier(line, slab);
    let billedWt = netWt;
    if (metalMult != null && metalMult > 0) {
      billedWt = netWt * metalMult;
    } else if (wastPct > 0) {
      billedWt = netWt * (1 + wastPct / 100);
    }
    const rate = resolveManualRowRatePerG(
      line,
      slab,
      silverPerG,
      goldPerG,
      wholesaleSilver,
      wholesaleGold
    );
    const metalCost = rate > 0 ? billedWt * rate : 0;
    const baseMcRate = Number(line.mc_rate ?? 0) || 0;
    const effMcRate = manualEffectiveMcRatePerUnit(line, slab);
    const pcs = Math.max(1, Number(line.qty) || 1);
    const perGm = isMcPerGmBillingType(line.mc_type);
    const totalMcBase = perGm ? netWt * baseMcRate : pcs * baseMcRate;
    const totalMc = perGm ? netWt * effMcRate : pcs * effMcRate;
    const fixedBase = Number(line.fixed_price ?? 0) || 0;
    const fixedR = Number(line.fixed_price_r ?? 0) || 0;
    let fixedTotal = fixedBase;
    if (line.mrpMode || line.manualCategory === "gift") {
      const baseTot = fixedBase * pcs;
      fixedTotal = fixedR > 0 ? fixedR * pcs : baseTot;
    }
    const box = Number(line.box_charges ?? 0) || 0;
    const stone2 = Number(line.stone_charges ?? 0) || 0;
    const metalDisc = manualSilverRateDiscountInr(line, slab, billedWt, rate, silverPerG);
    const mcDisc = Math.max(0, Math.round(totalMcBase - totalMc));
    const baseSubtotal = metalCost + totalMc + fixedTotal + box + stone2;
    const netSubtotal = Math.max(0, baseSubtotal - metalDisc);
    const taxable = Math.round(netSubtotal);
    const total = gstPct > 0 ? Math.round(taxable * (1 + gstPct / 100)) : taxable;
    const gstRounded = total - taxable;
    const mcBefore = baseMcRate > effMcRate && totalMcBase > totalMc ? Math.round(totalMcBase) : void 0;
    return {
      metal: Math.round(metalCost),
      mc: Math.round(totalMc),
      mc_before_discount: mcBefore,
      stone: stone2 + box,
      cgst: gstRounded / 2,
      sgst: gstRounded / 2,
      taxable,
      total,
      rate_per_gram: rate > 0 ? rate : void 0,
      net_weight: netWt,
      billable_weight_gm: Math.round(billedWt * 1e3) / 1e3,
      wastage_pct: wastPct > 0 && !lineHasMetalSlabPctInput(line, slab) ? wastPct : void 0
    };
  }

  // src/lib/erp-billing-pricing.ts
  function mcSlabFieldForBillingSlab(slab) {
    if (slab === "W") return "mc_rate_slab_w";
    if (slab === "F") return "mc_rate_slab_f";
    return "mc_rate_slab_r";
  }
  function erpSlabToKind(slab) {
    if (slab === "W") return "slab_w";
    if (slab === "F") return "slab_f";
    return "slab_r";
  }
  function isSilverGiftStockLine(line) {
    const sku = String(line.sku || "").toUpperCase();
    const style = String(line.style_code || "").toUpperCase();
    const inv = String(line.invoice_item_name || "").toUpperCase();
    return sku.includes("GIFT") || style.includes("GIFT ITEM") || inv.includes("GIFT ITEM");
  }
  function lineToItem(line) {
    return {
      barcode: line.barcode || line.code,
      sku: line.sku,
      item_name: line.name,
      style_code: line.style_code,
      metal_type: line.metal_type || "silver",
      net_weight: line.weightGm ?? void 0,
      net_wt: line.weightGm ?? void 0,
      purity: line.purity ?? 925,
      wastage_pct: line.wastage_pct ?? void 0,
      mc_rate: line.mc_rate ?? void 0,
      mc_type: line.mc_type ?? void 0,
      stone_charges: line.stone_charges ?? 0,
      stone_wt: line.stone_wt ?? void 0,
      box_charges: line.box_charges ?? 0,
      fixed_price: line.fixed_price ?? void 0,
      size: line.size ?? void 0,
      pcs: line.qty ?? 1
    };
  }
  function buildSlabContext(slab, settings, wholesaleGold, wholesaleSilver, metalType, goldSlabRShowMc = true) {
    const kind = erpSlabToKind(slab);
    return {
      kind,
      settings: tierSettingsForSlab(settings, kind, metalType),
      allSettings: settings,
      wholesaleGoldRatePerG: wholesaleGold ?? null,
      wholesaleSilverRatePerG: wholesaleSilver ?? null,
      goldSlabRUseMcPricing: goldSlabRShowMc !== false
    };
  }
  function resolveLineDisplayRates(line, displayRates, goldPerG = 0, silverPerG = 0) {
    const base = Array.isArray(displayRates) && displayRates.length ? displayRates.map((r) => ({ ...r })) : perGramToDisplayRates(goldPerG, silverPerG);
    if (!line.rateLocked || line.ratePerGram == null || !Number.isFinite(line.ratePerGram)) {
      return base;
    }
    const metal = String(line.metal_type || "").toLowerCase();
    const rate = Number(line.ratePerGram);
    if (metal.startsWith("gold")) {
      const p = Number(line.purity) || 75;
      let key = "gold";
      if (p >= 74 && p <= 76 || Math.abs(p - 75) < 1.5) key = "gold_18k";
      else if (p >= 90 && p <= 93 || Math.abs(p - 91.6) < 1.5) key = "gold_22k";
      const idx = base.findIndex((r) => (r.metal_type || "").toLowerCase() === key);
      const display_rate = Math.round(rate * 10);
      if (idx >= 0) base[idx] = { ...base[idx], display_rate };
      else base.push({ metal_type: key, display_rate });
      return base;
    }
    if (metal.startsWith("silver")) {
      const idx = base.findIndex((r) => (r.metal_type || "").toLowerCase() === "silver");
      const display_rate = Math.round(rate * 1e3);
      if (idx >= 0) base[idx] = { ...base[idx], display_rate };
      else base.push({ metal_type: "silver", display_rate });
    }
    return base;
  }
  function isWeightBasedSilverGiftLine(line) {
    if (!isSilverGiftStockLine(line)) return false;
    const wt = Number(line.weightGm ?? line.originalWeightGm ?? 0);
    if (wt <= 0) return false;
    const metal = String(line.metal_type || "").toLowerCase();
    if (isGiftingItem({ metal_type: metal })) return false;
    return metal.startsWith("silver");
  }
  function isSilverGiftMcGmLine(line) {
    if (!isWeightBasedSilverGiftLine(line)) return false;
    return !isMcPerPiece(line.mc_type);
  }
  function computeSilverGiftMcGmBreakdown(line, slab, slabSettings, silverPerG, wholesaleSilver, gstPct = 3) {
    const netWt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0;
    const qty = Math.max(1, Number(line.qty) || 1);
    const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), line.metal_type);
    const silverOffset = slab === "R" ? Math.max(0, Number(tier.silver_rate_offset_per_g) || 0) : 0;
    const metalRate = resolveErpSilverMetalRatePerG(
      slab,
      silverPerG,
      wholesaleSilver,
      silverOffset
    );
    const mcBase = Number(line.mc_rate) || 0;
    const mcDisc = Math.max(
      0,
      Math.min(
        100,
        Number(tier.mc_gm_discount_pct ?? tier.mc_discount_pct) || 0
      )
    );
    const mcPerG = mcDisc > 0 ? mcBase * (1 - mcDisc / 100) : mcBase;
    const combinedPerG = metalRate + mcPerG;
    const metalPart = Math.round(metalRate * netWt * qty);
    const mc = Math.round(mcPerG * netWt * qty);
    const taxable = metalPart + mc;
    const totalWithGst = Math.round(taxable * (1 + gstPct / 100));
    const gstAmt = totalWithGst - taxable;
    const box = Number(line.box_charges || 0) || 0;
    const total = totalWithGst + box;
    return {
      metal: metalPart,
      mc,
      stone: 0,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable,
      total,
      rate_per_gram: metalRate,
      net_weight: netWt,
      billable_weight_gm: netWt,
      mc_before_discount: mcDisc > 0 && mcBase > mcPerG ? Math.round(mcBase * netWt * qty) : void 0,
      mc_discount_pct: mcDisc > 0 && mcBase > mcPerG ? mcDisc : void 0
    };
  }
  function isPiecePricedBillLine(line) {
    if (line.mrpMode) {
      const list = Number(line.mrpListPrice ?? 0);
      const fixed = Number(line.fixed_price ?? line.unitInr ?? 0);
      if (list > 0 || fixed > 0) return true;
    }
    if (isWeightBasedSilverGiftLine(line)) return false;
    const wt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0;
    const mcType = String(line.mc_type || "").toUpperCase();
    if (mcType.includes("FIXED")) {
      const rate = Number(line.fixed_price ?? line.unitInr ?? line.mc_rate ?? 0);
      if (rate > 0 && wt <= 0) return true;
    }
    const item = lineToItem(line);
    if (isFixedPriceCatalogItem(item) && Number(item.fixed_price ?? 0) > 0) return true;
    if (line.mrpMode) return true;
    if (line.manualCategory === "gift") {
      const wt2 = Number(line.weightGm ?? line.originalWeightGm ?? 0);
      const metal = String(line.metal_type || "").toLowerCase();
      if (wt2 > 0 && metal.startsWith("silver") && isSilverGiftStockLine(line)) return false;
      const pieceRate2 = Number(line.unitInr ?? line.fixed_price ?? 0);
      return pieceRate2 > 0 && wt2 <= 0;
    }
    const pieceRate = Number(line.unitInr ?? line.fixed_price ?? 0);
    return pieceRate > 0 && wt <= 0;
  }
  var ERP_LINE_GST_PCT = 3;
  function erpBillGstPct(gstEnabled) {
    return gstEnabled === false ? 0 : ERP_LINE_GST_PCT;
  }
  function applyGstToBreakdown(bd, gstPct) {
    const taxable = Math.round(bd.taxable);
    if (gstPct <= 0) {
      return { ...bd, taxable, total: taxable, cgst: 0, sgst: 0 };
    }
    if (bd.total === taxable && (bd.cgst || 0) === 0 && (bd.sgst || 0) === 0) {
      const total = Math.round(taxable * (1 + gstPct / 100));
      const gstAmt = total - taxable;
      return { ...bd, taxable, total, cgst: gstAmt / 2, sgst: gstAmt / 2 };
    }
    return bd;
  }
  function erpAdditiveFixedChargeInr(line) {
    if (isPiecePricedBillLine(line)) return 0;
    const fixed = Number(line.fixed_price ?? 0) || 0;
    if (fixed <= 0) return 0;
    const wt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0;
    return wt > 0 ? fixed : 0;
  }
  function appendTaxableExtraToBreakdown(bd, extra, gstPct = ERP_LINE_GST_PCT) {
    if (extra <= 0) return bd;
    const taxable = Math.round(bd.taxable + extra);
    if (gstPct <= 0) {
      return { ...bd, taxable, total: taxable, cgst: 0, sgst: 0 };
    }
    const total = Math.round(taxable * (1 + gstPct / 100));
    const gstAmt = total - taxable;
    return { ...bd, taxable, total, cgst: gstAmt / 2, sgst: gstAmt / 2 };
  }
  function finalizeWeightBasedBreakdown(line, bd, gstPct = ERP_LINE_GST_PCT) {
    const extra = erpAdditiveFixedChargeInr(line);
    if (extra > 0) return appendTaxableExtraToBreakdown(bd, extra, gstPct);
    if (gstPct <= 0) return applyGstToBreakdown(bd, 0);
    return bd;
  }
  function shouldSkipRetailSilverRateMarkdown(line, slab) {
    if (slab !== "R") return true;
    if (line.rateLocked && Number(line.ratePerGram) > 0) return true;
    if (lineHasMetalSlabPctInput(line, slab)) return true;
    if (lineHasPieceSlabFields(line) && pieceSlabMetalFraction(line, slab) < 0.999) return true;
    return false;
  }
  function finalizeSilverBillLineBreakdown(line, bd, silverPerG, slab = "R", gstPct = ERP_LINE_GST_PCT) {
    let next = finalizeWeightBasedBreakdown(line, bd, gstPct);
    if (isManualArticlesOrJewelleryLine(line) || isPiecePricedBillLine(line)) return next;
    if (isSilverGiftStockLine(line) || isSilverGiftMcGmLine(line)) return next;
    if (shouldSkipRetailSilverRateMarkdown(line, slab)) return next;
    const metal = String(line.metal_type || "").toLowerCase();
    if (!metal.startsWith("silver")) return next;
    const wt = Number(bd.billable_weight_gm ?? line.originalWeightGm ?? line.weightGm) || 0;
    const rate = Number(line.ratePerGram ?? bd.rate_per_gram);
    if (wt <= 0 || !Number.isFinite(rate) || rate <= 0 || silverPerG <= rate) {
      return applyGstToBreakdown(next, gstPct);
    }
    const metalDisc = Math.round((silverPerG - rate) * wt);
    const net = Math.max(0, next.taxable - metalDisc);
    return applyGstToBreakdown({ ...next, taxable: net }, gstPct);
  }
  function applyPiecePricedLineCalc(line, gstEnabled = true) {
    const parsed = Number(line.qty);
    const slabPer = Number(line.unitInr ?? line.fixed_price ?? 0) || 0;
    const customPer = Number(line.fixed_price_r ?? 0) || 0;
    const pieceRate = customPer > 0 ? customPer : slabPer > 0 ? slabPer : Number(line.ratePerGram ?? line.mc_rate) || 0;
    const isGift = line.manualCategory === "gift" || !!line.mrpMode;
    let qty = Number.isFinite(parsed) && parsed > 0 ? parsed : isGift ? 0 : 1;
    if (pieceRate > 0 && qty <= 0 && (line.mrpMode || isFixedPriceCatalogItem(lineToItem(line)))) {
      qty = 1;
    }
    const box = Number(line.box_charges || 0) || 0;
    const taxable = Math.round((qty * pieceRate + box) * 100) / 100;
    const gstPct = erpBillGstPct(gstEnabled);
    const total = gstPct > 0 ? Math.round(taxable * (1 + gstPct / 100)) : Math.round(taxable);
    return {
      ...line,
      qty,
      unitInr: pieceRate > 0 ? pieceRate : line.unitInr,
      lineTotalInr: total
    };
  }
  function erpManualLineWithSlabRetailSilverRate(line, slab, silverPerG, slabSettings, wholesaleSilver, literalCustomMetalRate) {
    if (literalCustomMetalRate) return line;
    if (line.rateLocked && Number(line.ratePerGram) > 0) return line;
    const silverMetal = String(line.metal_type || "").toLowerCase().startsWith("silver");
    const silverOffset = slab === "R" ? Math.max(0, Number(slabSettings.slab_r?.silver_rate_offset_per_g) || 0) : 0;
    if (!silverMetal || slab !== "R" || silverOffset <= 0) return line;
    return {
      ...line,
      ratePerGram: resolveErpSilverMetalRatePerG(
        slab,
        silverPerG,
        wholesaleSilver,
        silverOffset
      )
    };
  }
  function computeLineBreakdown(line, displayRates, slab, slabSettings, wholesaleGold, wholesaleSilver, goldPerG = 0, silverPerG = 0, goldSlabRShowMc = true, opts) {
    const gstPct = erpBillGstPct(opts?.gstEnabled);
    if (isSilverGiftMcGmLine(line)) {
      const bd2 = computeSilverGiftMcGmBreakdown(
        line,
        slab,
        slabSettings,
        silverPerG,
        wholesaleSilver,
        gstPct
      );
      return finalizeWeightBasedBreakdown(line, bd2, gstPct);
    }
    if (isManualArticlesOrJewelleryLine(line)) {
      const manualLine = erpManualLineWithSlabRetailSilverRate(
        line,
        slab,
        silverPerG,
        slabSettings,
        wholesaleSilver,
        opts?.literalCustomMetalRate
      );
      return computeManualAsLineBreakdown(
        manualLine,
        slab,
        silverPerG,
        goldPerG,
        wholesaleSilver,
        wholesaleGold,
        gstPct
      );
    }
    if (isPiecePricedBillLine(line)) {
      const priced = applyPiecePricedLineCalc(line, opts?.gstEnabled !== false);
      const total = Number(priced.lineTotalInr) || 0;
      if (gstPct <= 0) {
        const taxable3 = Math.round(total);
        return {
          metal: 0,
          mc: 0,
          stone: Number(line.box_charges || 0) || 0,
          cgst: 0,
          sgst: 0,
          taxable: taxable3,
          total: taxable3
        };
      }
      const taxable2 = total / (1 + gstPct / 100);
      const gstAmt = total - taxable2;
      return {
        metal: 0,
        mc: 0,
        stone: Number(line.box_charges || 0) || 0,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        taxable: taxable2,
        total
      };
    }
    const metal = String(line.metal_type || "").toLowerCase();
    const slabLine = {
      ...line,
      originalWeightGm: line.originalWeightGm ?? line.weightGm
    };
    const useStockPieceSlab = !slabLine.manualEntry && lineHasPieceSlabFields(slabLine) && metal.startsWith("silver") && !isSilverGiftStockLine(slabLine);
    if (useStockPieceSlab) {
      const adjusted = applyPieceSlabToLine(slabLine, slab);
      const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), line.metal_type);
      const silverOffset = opts?.literalCustomMetalRate ? 0 : slab === "R" ? Math.max(0, Number(tier.silver_rate_offset_per_g) || 0) : 0;
      const mcDisc = isMcPerPiece(adjusted.mc_type) ? Math.max(0, Number(tier.mc_discount_pct) || 0) : Math.max(0, Number(tier.mc_gm_discount_pct ?? tier.mc_discount_pct) || 0);
      let bd2 = computeErpPieceSlabBreakdown(
        adjusted,
        slab,
        silverPerG,
        wholesaleSilver,
        gstPct,
        silverOffset,
        mcDisc
      );
      bd2 = finalizeSilverBillLineBreakdown(line, bd2, silverPerG, slab, gstPct);
      const box2 = Number(line.box_charges || 0) || 0;
      if (box2 <= 0) return bd2;
      const taxable2 = bd2.taxable + box2;
      return applyGstToBreakdown({ ...bd2, taxable: taxable2 }, gstPct);
    }
    const item = lineToItem(slabLine);
    const ctx = buildSlabContext(
      slab,
      slabSettings,
      wholesaleGold,
      wholesaleSilver,
      line.metal_type,
      goldSlabRShowMc
    );
    const rates = resolveLineDisplayRates(line, displayRates, goldPerG, silverPerG);
    let bd = calculateBreakdownWithSlab(item, rates, gstPct, ctx);
    bd = finalizeSilverBillLineBreakdown(line, bd, silverPerG, slab, gstPct);
    const box = Number(line.box_charges || 0) || 0;
    if (box <= 0) return bd;
    const taxable = bd.taxable + box;
    return applyGstToBreakdown({ ...bd, taxable }, gstPct);
  }
  function parseSlabSettingsFromUser(raw) {
    if (raw && typeof raw === "object" && "reseller_slab_settings" in raw) {
      return parseResellerSlabSettings(
        raw.reseller_slab_settings
      );
    }
    return parseResellerSlabSettings(raw);
  }
  function perGramToDisplayRates(goldPerG, silverPerG) {
    return [
      { metal_type: "gold", display_rate: Math.round(goldPerG * 10) },
      { metal_type: "gold_22k", display_rate: Math.round(goldPerG * 10 * 0.916) },
      { metal_type: "gold_18k", display_rate: Math.round(goldPerG * 10 * 0.75) },
      { metal_type: "silver", display_rate: Math.round(silverPerG * 1e3) }
    ];
  }

  // src/lib/erp-manual-barcode.ts
  var STORAGE_KEY = "kc-erp-manual-barcodes-v1";
  function loadUsed() {
    if (typeof window === "undefined") return /* @__PURE__ */ new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return new Set(list.filter(Boolean));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function saveUsed(used) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...used].slice(-5e3)));
  }
  function randomDigits(length) {
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += String(Math.floor(Math.random() * 10));
    }
    if (out[0] === "0") out = `${Math.floor(Math.random() * 9) + 1}${out.slice(1)}`;
    return out;
  }
  function generateManualBarcode(extraUsed = []) {
    const used = loadUsed();
    for (const code of extraUsed) {
      const c = String(code || "").trim();
      if (c) used.add(c);
    }
    for (let len = 6; len <= 10; len += 1) {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        const candidate = randomDigits(len);
        if (!used.has(candidate)) {
          used.add(candidate);
          saveUsed(used);
          return candidate;
        }
      }
    }
    const fallback = randomDigits(10);
    used.add(fallback);
    saveUsed(used);
    return fallback;
  }

  // src/lib/erp-billing-shortcuts.ts
  var CATEGORY_LABELS = {
    articles: ["SILVER ARTICLES", "SILVER ARTICLE"],
    jewellery: ["SILVER JEWELLERY", "SILVER JEWELRY"],
    bullion: ["SILVER BAR", "GRAINS", "SILVER BULLION"],
    gift: ["GIFT ITEMS", "GIFT ITEM"]
  };
  var BILLING_SCAN_SHORTCUTS = {
    A: "articles",
    S: "jewellery",
    B: "bullion",
    G: "gift"
  };
  function resolveBillingScanShortcut(code) {
    const key = code.trim().toUpperCase();
    if (key.length !== 1) return null;
    return BILLING_SCAN_SHORTCUTS[key] ?? null;
  }
  function findInvoiceItemForCategory(category, items) {
    const labels = CATEGORY_LABELS[category].map((x) => x.toUpperCase());
    for (const label of labels) {
      const hit = items.find((it) => it.name.trim().toUpperCase() === label);
      if (hit) return hit;
    }
    for (const label of labels) {
      const hit = items.find((it) => it.name.trim().toUpperCase().includes(label.split(" ")[0]));
      if (hit) return hit;
    }
    return null;
  }
  function createManualBillLine(category, invoiceItem, slab = "R", usedCodes = []) {
    const lineId = generateManualBarcode(usedCodes);
    const base = {
      name: "",
      code: lineId,
      barcode: "",
      sku: void 0,
      style_code: void 0,
      size: null,
      qty: category === "gift" ? 0 : 1,
      originalWeightGm: null,
      weightGm: null,
      gross_weight: null,
      bag_wt: null,
      bags: null,
      purity: null,
      wastage_pct: null,
      ratePerGram: null,
      mc_rate: null,
      mc_type: null,
      box_charges: 0,
      stone_charges: 0,
      metal_type: category === "gift" ? null : "silver",
      fixed_price: null,
      unitInr: null,
      stock_piece_id: null,
      lineTotalInr: null,
      invoice_item_name: invoiceItem.name,
      hsn_code: invoiceItem.hsn,
      manualEntry: true,
      manualEntryOpen: true,
      manualCategory: category,
      mrpMode: void 0
    };
    if (category === "gift") return base;
    return applyPieceSlabToLine(base, slab);
  }
  var GIFT_ENTRY_FIELD_ORDER = [
    "sku",
    "style_code",
    "name",
    "size",
    "stone_charges",
    "qty",
    "fixed_price",
    "fixed_price_r"
  ];
  var MANUAL_ENTRY_FIELD_ORDER = [
    "sku",
    "style_code",
    "name",
    "size",
    "weightGm",
    "gross_weight",
    "bags",
    "bag_wt",
    "metal_slab_pct",
    "purity",
    "wastage_pct",
    "ratePerGram",
    "mc_rate",
    "mc_rate_slab_r",
    "mc_type",
    "qty",
    "box_charges",
    "stone_charges",
    "metal_type",
    "fixed_price",
    "fixed_price_r"
  ];
  function skuKey(sku) {
    return sku.trim().toUpperCase();
  }
  function uniqueSkusFromCatalog(catalog) {
    const bySku = /* @__PURE__ */ new Map();
    for (const s of catalog) {
      for (const sk of s.skus) {
        const key = skuKey(sk.sku);
        if (!key) continue;
        const incoming = {
          sku: sk.sku.trim(),
          style_code: s.style_code,
          product_name: sk.product_name,
          product_names: sk.product_names,
          image_url: sk.image_url
        };
        const existing = bySku.get(key);
        if (!existing) {
          bySku.set(key, incoming);
          continue;
        }
        const incomingScore = (incoming.product_names?.length ?? 0) + (incoming.product_name ? 1 : 0);
        const existingScore = (existing.product_names?.length ?? 0) + (existing.product_name ? 1 : 0);
        if (incomingScore > existingScore) bySku.set(key, incoming);
      }
    }
    return [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }
  function findStylesForSku(catalog, sku) {
    const q = skuKey(sku);
    const styles = [];
    const seen = /* @__PURE__ */ new Set();
    for (const s of catalog) {
      if (!s.skus.some((sk) => skuKey(sk.sku) === q)) continue;
      const code = s.style_code.trim();
      const k = code.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      styles.push(code);
    }
    return styles;
  }
  function findStyleForSku(catalog, sku) {
    const unique = uniqueSkusFromCatalog(catalog);
    const hit = unique.find((x) => skuKey(x.sku) === skuKey(sku));
    if (hit) return hit.style_code;
    const styles = findStylesForSku(catalog, sku);
    return styles[0] ?? null;
  }
  function findSkuEntry(catalog, sku) {
    return uniqueSkusFromCatalog(catalog).find((x) => skuKey(x.sku) === skuKey(sku)) ?? null;
  }
  function productNamesForSku(catalog, sku) {
    const entry = findSkuEntry(catalog, sku);
    if (entry?.product_names?.length) return entry.product_names;
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const s of catalog) {
      for (const sk of s.skus) {
        if (skuKey(sk.sku) !== skuKey(sku)) continue;
        for (const p of sk.product_names || []) {
          const k = p.name.trim().toUpperCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          out.push(p);
        }
        if (sk.product_name) {
          const k = sk.product_name.trim().toUpperCase();
          if (k && !seen.has(k)) {
            seen.add(k);
            out.push({ name: sk.product_name, image_url: sk.image_url });
          }
        }
      }
    }
    return out;
  }
  function isGiftManualLine(line) {
    return line.manualCategory === "gift" || !!line.mrpMode;
  }
  function entryFieldOrderForLine(line) {
    return isGiftManualLine(line) ? GIFT_ENTRY_FIELD_ORDER : MANUAL_ENTRY_FIELD_ORDER;
  }
  function nextManualEntryField(current, line, rateSlab = "R") {
    const order = line ? entryFieldOrderForLine(line) : MANUAL_ENTRY_FIELD_ORDER;
    if (line) return nextVisibleManualEntryField(current, line, order, rateSlab);
    const idx = order.indexOf(current);
    if (idx < 0 || idx >= order.length - 1) return null;
    return order[idx + 1] ?? null;
  }
  function firstManualEntryField(line) {
    return entryFieldOrderForLine(line)[0] ?? "sku";
  }

  // src/lib/erp-gift-mrp-pricing.ts
  function giftMrpDiscountPct(slab, slabSettings) {
    const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
    const own = clamp(tierSettingsForSlab(slabSettings, erpSlabToKind(slab), "gifting").gift_discount_pct);
    if (slab === "F" && own === 0) {
      return clamp(tierSettingsForSlab(slabSettings, "slab_w", "gifting").gift_discount_pct);
    }
    return own;
  }
  function giftMrpSlabPrice(mrp, slab, slabSettings) {
    const m = Number(mrp);
    if (!Number.isFinite(m) || m <= 0) return 0;
    const disc = giftMrpDiscountPct(slab, slabSettings);
    return Math.round(m * (1 - disc / 100) * 100) / 100;
  }
  function applyGiftMrpPieceRate(line, slab, slabSettings) {
    const list = Number(line.mrpListPrice);
    if (!Number.isFinite(list) || list <= 0) return line;
    const slabPrice = giftMrpSlabPrice(list, slab, slabSettings);
    return {
      ...line,
      fixed_price: slabPrice,
      unitInr: slabPrice,
      mrpMode: true
    };
  }

  // src/lib/exhibition/exhibition-bill-line-recalc.ts
  function recalcExhibitionBillLine(line, opts) {
    if (isPiecePricedBillLine(line)) {
      const withMrp = applyGiftMrpPieceRate(line, opts.slab, opts.slabSettings);
      return { ...withMrp, ...applyPiecePricedLineCalc(withMrp) };
    }
    const rates = opts.displayRates ?? perGramToDisplayRates(opts.goldPerG, opts.silverPerG);
    const mcMode = opts.goldSlabRShowMc !== false;
    const withOriginal = {
      ...line,
      originalWeightGm: line.originalWeightGm ?? line.weightGm
    };
    const skipPieceSlabWeight = isWeightBasedSilverGiftLine(withOriginal) || isSilverGiftStockLine(withOriginal);
    const slabLine = skipPieceSlabWeight ? withOriginal : applyPieceSlabToLine(withOriginal, opts.slab);
    const bd = computeLineBreakdown(
      slabLine,
      rates,
      opts.slab,
      opts.slabSettings,
      opts.wholesaleGold ?? null,
      opts.wholesaleSilver ?? null,
      opts.goldPerG,
      opts.silverPerG,
      mcMode
    );
    const next = {
      ...slabLine,
      lineTotalInr: bd.total,
      originalWeightGm: withOriginal.originalWeightGm
    };
    const silverMetal = String(line.metal_type || "").toLowerCase().startsWith("silver");
    const silverOffset = opts.slab === "R" ? Math.max(0, Number(opts.slabSettings.slab_r?.silver_rate_offset_per_g) || 0) : 0;
    if (silverMetal && opts.slab === "R" && silverOffset > 0) {
      next.ratePerGram = resolveErpSilverMetalRatePerG(
        opts.slab,
        opts.silverPerG,
        opts.wholesaleSilver ?? null,
        silverOffset
      );
    } else if (!line.rateLocked) {
      const r = bd.rate_per_gram;
      next.ratePerGram = r != null && Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
    }
    if (lineHasPieceSlabFields(line) && silverMetal && !isSilverGiftStockLine(line) && !line.rateLocked && next.ratePerGram == null) {
      const r = bd.rate_per_gram;
      if (r != null && Number.isFinite(r)) {
        next.ratePerGram = Math.round(r * 100) / 100;
      }
    }
    return next;
  }
  function cartTotalsFromLines(lines) {
    let items = 0;
    let weight = 0;
    let net = 0;
    for (const l of lines) {
      const qty = Math.max(1, Number(l.qty) || 1);
      items += qty;
      const wt = Number(l.weightGm ?? l.originalWeightGm ?? 0) || 0;
      weight += wt * qty;
      net += Number(l.lineTotalInr) || 0;
    }
    const gstPct = 3;
    const subtotal = net > 0 ? Math.round(net / (1 + gstPct / 100)) : 0;
    const gst = net - subtotal;
    return { items, weight, subtotal, gst, netTotal: net };
  }

  // src/lib/exhibition/exhibition-billing-bundle.ts
  function calcLineTotal(line, rates, slab, slabSettingsRaw) {
    const slabSettings = parseSlabSettingsFromUser(slabSettingsRaw);
    const recalced = recalcExhibitionBillLine(line, {
      slab,
      slabSettings,
      goldPerG: Number(rates.gold_per_gram) || 0,
      silverPerG: Number(rates.silver_per_gram) || 0,
      wholesaleGold: rates.wholesale_gold_per_gram ?? null,
      wholesaleSilver: rates.wholesale_silver_per_gram ?? null
    });
    return Number(recalced.lineTotalInr) || 0;
  }
  function recalcBillLine(line, rates, slab, slabSettingsRaw) {
    const slabSettings = parseSlabSettingsFromUser(slabSettingsRaw);
    return recalcExhibitionBillLine(line, {
      slab,
      slabSettings,
      goldPerG: Number(rates.gold_per_gram) || 0,
      silverPerG: Number(rates.silver_per_gram) || 0,
      wholesaleGold: rates.wholesale_gold_per_gram ?? null,
      wholesaleSilver: rates.wholesale_silver_per_gram ?? null
    });
  }
  var api = {
    generateManualBarcode,
    resolveBillingScanShortcut,
    findInvoiceItemForCategory,
    createManualBillLine,
    uniqueSkusFromCatalog,
    findStyleForSku,
    findStylesForSku,
    productNamesForSku,
    findCatalogProduct,
    patchLineFromCatalogProduct,
    patchLineFromCatalogSize,
    nextFieldAfterCatalogProduct,
    nextFieldAfterCatalogSize,
    findDesignOptionLabel,
    firstManualEntryField,
    nextManualEntryField,
    entryFieldOrderForLine: (line) => isGiftManualLine(line) ? GIFT_ENTRY_FIELD_ORDER : MANUAL_ENTRY_FIELD_ORDER,
    isGiftManualLine,
    calcLineTotal,
    recalcBillLine,
    computeLineBreakdown,
    parseSlabSettingsFromUser,
    perGramToDisplayRates,
    giftMrpSlabPrice,
    cartTotalsFromLines,
    MANUAL_ENTRY_FIELD_ORDER,
    GIFT_ENTRY_FIELD_ORDER
  };
  if (typeof window !== "undefined") {
    window.KcExhibitionBilling = api;
  }
  return __toCommonJS(exhibition_billing_bundle_exports);
})();
if(typeof window!=="undefined"&&window.KcExhibitionBillingModule){window.KcExhibitionBilling=window.KcExhibitionBillingModule.KcExhibitionBilling||window.KcExhibitionBillingModule;}
