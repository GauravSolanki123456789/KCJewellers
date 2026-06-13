import { useMemo } from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import {
  getCustomerDisplaySize,
  getCustomerDisplayWeightLabel,
  type Item,
  type WholesalePricingInput,
} from "@/lib/pricing";
import { computeSharedCatalogUnitPrice } from "@/lib/shared-catalog-pricing";
import { getProductBoxCharges } from "@/lib/product-box-pricing";
import { getProductSelectionKey } from "@/lib/catalog-product-filters";
import type { ItemWithPdfImage } from "@/lib/pdf-embed-images";
import { getKcPdfPalette, type KcPdfPalette } from "@/lib/kc-pdf-palette";

function buildCatalogPdfStyles(p: KcPdfPalette) {
  return StyleSheet.create({
    page: {
      padding: 28,
      paddingBottom: 40,
      backgroundColor: p.pageBg,
      fontFamily: "Helvetica",
    },
    header: {
      marginBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: p.accent,
      paddingBottom: 10,
    },
    brand: { fontSize: 20, color: p.brand, fontWeight: "bold" },
    sub: { fontSize: 10, color: p.subMuted, marginTop: 4 },
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 10,
    },
    summaryBadge: {
      backgroundColor: p.accent,
      borderRadius: 6,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    summaryBadgeText: {
      fontSize: 10,
      color: "#ffffff",
      fontWeight: "bold",
    },
    orderTable: {
      marginTop: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: p.cardBorder,
      borderRadius: 8,
      overflow: "hidden",
    },
    orderTableTitle: {
      backgroundColor: p.accent,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    orderTableTitleText: {
      fontSize: 10,
      color: "#ffffff",
      fontWeight: "bold",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    orderTableHead: {
      flexDirection: "row",
      backgroundColor: p.cardBg,
      borderBottomWidth: 1,
      borderBottomColor: p.cardBorder,
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    orderTableHeadCell: {
      fontSize: 7,
      color: p.metaLabel,
      fontWeight: "bold",
      textTransform: "uppercase",
    },
    orderTableRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: p.cardBorder,
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: "#ffffff",
    },
    orderTableRowAlt: {
      backgroundColor: p.cardBg,
    },
    orderColNo: { width: "6%" },
    orderColName: { width: "28%" },
    orderColSize: { width: "18%" },
    orderColQty: { width: "14%" },
    orderColUnit: { width: "17%" },
    orderColLine: { width: "17%" },
    orderCell: { fontSize: 8, color: p.textPrimary },
    orderCellQty: {
      fontSize: 10,
      color: p.brand,
      fontWeight: "bold",
    },
    orderCellLine: {
      fontSize: 9,
      color: p.accent,
      fontWeight: "bold",
    },
    orderTableFoot: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: p.cardBg,
      paddingVertical: 7,
      paddingHorizontal: 10,
    },
    orderTableFootText: {
      fontSize: 9,
      color: p.textPrimary,
      fontWeight: "bold",
    },
    orderTableFootTotal: {
      fontSize: 10,
      color: p.accent,
      fontWeight: "bold",
    },
    photosTitle: {
      fontSize: 9,
      color: p.textSecondary,
      fontWeight: "bold",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    card: {
      width: "31%",
      minWidth: 118,
      marginBottom: 8,
      backgroundColor: p.cardBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: p.cardBorder,
      padding: 8,
    },
    thumbWrap: {
      width: "100%",
      height: 96,
      backgroundColor: p.thumbBg,
      borderRadius: 6,
      marginBottom: 6,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    thumb: {
      width: "100%",
      height: 96,
      objectFit: "cover",
      borderRadius: 6,
    },
    thumbPlaceholder: {
      fontSize: 28,
      color: p.metaLabel,
      fontWeight: "bold",
    },
    qtyOverlay: {
      position: "absolute",
      top: 4,
      left: 4,
      backgroundColor: p.accent,
      borderRadius: 5,
      paddingVertical: 4,
      paddingHorizontal: 7,
    },
    qtyOverlayText: {
      fontSize: 11,
      color: "#ffffff",
      fontWeight: "bold",
    },
    productName: {
      fontSize: 11,
      color: p.brand,
      fontWeight: "bold",
      textTransform: "uppercase",
      marginBottom: 3,
    },
    sizeLine: {
      fontSize: 9,
      color: p.textPrimary,
      fontWeight: "bold",
      marginBottom: 4,
    },
    refLine: {
      fontSize: 7,
      color: p.metaLabel,
      marginBottom: 3,
    },
    weightLine: { fontSize: 8, color: p.textSecondary, marginBottom: 2 },
    unitPriceLine: {
      fontSize: 8,
      color: p.textSecondary,
      marginBottom: 2,
    },
    priceCompare: {
      fontSize: 8,
      color: p.textSecondary,
      textDecoration: "line-through",
      marginBottom: 1,
    },
    priceLine: {
      fontSize: 13,
      color: p.accent,
      fontFamily: "Helvetica",
      fontWeight: "bold",
      marginTop: 1,
      marginBottom: 2,
    },
    priceGst: {
      fontSize: 7,
      color: p.textSecondary,
      marginBottom: 2,
    },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 28,
      right: 28,
      fontSize: 7,
      color: p.footer,
      textAlign: "center",
    },
  });
}

function displayName(p: Item) {
  const custom = (p as { shareCatalogDisplayTitle?: string }).shareCatalogDisplayTitle;
  if (custom && String(custom).trim()) return String(custom).trim();
  return (
    (p as { name?: string }).name ||
    p.item_name ||
    p.short_name ||
    String(p.barcode || p.sku || "")
  );
}

/** RESELLER brochure PDF: show marked-up prices (same basis as shared web catalogue). */
export type CatalogPdfResellerPricing = {
  rates: unknown;
  markupPercentage: number;
  discountPercentage?: number;
  /** Mirrors logged-in reseller catalogue pricing before brochure markup. */
  wholesale?: WholesalePricingInput | null;
  /** Site-wide gift GST toggle — same as shared catalogue API. */
  giftingGstEnabled?: boolean;
};

export type CatalogPdfOrderSummary = {
  totalPieces: number;
  designCount: number;
  orderTotalInr?: number | null;
};

export type CatalogPdfDocumentProps = {
  products: ItemWithPdfImage[];
  brandName?: string;
  resellerPdfPricing?: CatalogPdfResellerPricing | null;
  /** Matches `document.documentElement.dataset.kcTheme` / `kc_theme_id`. */
  kcThemeId?: string | null;
  /** First line under brand, before item count — default `Catalogue` (keyword: shared shortlist PDF). */
  itemsLabel?: string;
  /** Weight-only brochure — skip price lines even when resellerPdfPricing is set. */
  hidePrices?: boolean;
  orderSummary?: CatalogPdfOrderSummary | null;
};

const PER_PAGE = 9;

type PdfLineMeta = {
  index: number;
  name: string;
  sizeText: string | null;
  shareQty: number;
  unitPriceStr: string | null;
  lineTotalStr: string | null;
};

function resolvePdfLineMeta(
  raw: ItemWithPdfImage,
  index: number,
  hidePrices: boolean,
  resellerPdfPricing: CatalogPdfResellerPricing | null,
): PdfLineMeta {
  const p = raw as ItemWithPdfImage;
  const name = displayName(p);
  const sizeText =
    (p as { shareCatalogSize?: string }).shareCatalogSize?.trim() ||
    getCustomerDisplaySize(p) ||
    null;
  const shareQty = Math.max(
    1,
    Math.floor(Number((p as { shareCatalogQty?: number }).shareCatalogQty) || 1),
  );

  const presetLine = (p as { shareCatalogLineTotalInr?: number }).shareCatalogLineTotalInr;
  const presetUnit = (p as { shareCatalogUnitTotalInr?: number }).shareCatalogUnitTotalInr;

  let lineTotalStr: string | null = null;
  let unitPriceStr: string | null = null;

  if (!hidePrices) {
    if (presetLine != null && Number.isFinite(presetLine)) {
      lineTotalStr = Math.round(presetLine).toLocaleString("en-IN");
      const unit =
        presetUnit != null && Number.isFinite(presetUnit)
          ? Math.round(presetUnit)
          : Math.round(presetLine / shareQty);
      unitPriceStr = unit.toLocaleString("en-IN");
    } else if (resellerPdfPricing && resellerPdfPricing.rates != null) {
      const mk = Math.max(0, Number(resellerPdfPricing.markupPercentage) || 0);
      const disc = Math.max(0, Number(resellerPdfPricing.discountPercentage) || 0);
      const giftingGstEnabled = resellerPdfPricing.giftingGstEnabled !== false;
      const price = computeSharedCatalogUnitPrice(
        p,
        resellerPdfPricing.rates,
        mk,
        resellerPdfPricing.wholesale ?? undefined,
        giftingGstEnabled,
        disc,
      );
      const unitInr = price.unitTotalInr;
      lineTotalStr = (unitInr * shareQty).toLocaleString("en-IN");
      unitPriceStr = unitInr.toLocaleString("en-IN");
    }
  }

  return { index, name, sizeText, shareQty, unitPriceStr, lineTotalStr };
}

export function CatalogPdfDocument({
  products,
  brandName = "KC Jewellers",
  resellerPdfPricing = null,
  kcThemeId = null,
  itemsLabel = "Catalogue",
  hidePrices = false,
  orderSummary = null,
}: CatalogPdfDocumentProps) {
  const palette = useMemo(() => getKcPdfPalette(kcThemeId || undefined), [kcThemeId]);
  const styles = useMemo(() => buildCatalogPdfStyles(palette), [palette]);

  const lineMeta = useMemo(
    () =>
      products.map((raw, i) =>
        resolvePdfLineMeta(raw, i, hidePrices, resellerPdfPricing),
      ),
    [products, hidePrices, resellerPdfPricing],
  );

  const chunks: ItemWithPdfImage[][] = [];
  for (let i = 0; i < products.length; i += PER_PAGE) {
    chunks.push(products.slice(i, i + PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const totalPieces =
    orderSummary?.totalPieces ??
    lineMeta.reduce((sum, row) => sum + row.shareQty, 0);
  const designCount = orderSummary?.designCount ?? products.length;
  const orderTotalInr =
    orderSummary?.orderTotalInr ??
    lineMeta.reduce((sum, row) => {
      if (!row.lineTotalStr) return sum;
      return sum + Number(row.lineTotalStr.replace(/,/g, ""));
    }, 0);

  return (
    <Document>
      {chunks.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {pageIndex === 0 && (
            <View style={styles.header}>
              <Text style={styles.brand}>{brandName}</Text>
              <Text style={styles.sub}>
                {itemsLabel} · {designCount} design{designCount !== 1 ? "s" : ""} · {totalPieces}{" "}
                pc{totalPieces !== 1 ? "s" : ""}
              </Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryBadge}>
                  <Text style={styles.summaryBadgeText}>
                    {totalPieces} pc{totalPieces !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.summaryBadge}>
                  <Text style={styles.summaryBadgeText}>
                    {designCount} design{designCount !== 1 ? "s" : ""}
                  </Text>
                </View>
                {!hidePrices && orderTotalInr > 0 ? (
                  <View style={styles.summaryBadge}>
                    <Text style={styles.summaryBadgeText}>
                      Est. Rs. {Math.round(orderTotalInr).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {pageIndex === 0 && lineMeta.length > 0 ? (
            <View style={styles.orderTable}>
              <View style={styles.orderTableTitle}>
                <Text style={styles.orderTableTitleText}>
                  {hidePrices ? "Shortlist summary" : "Order summary — quantities"}
                </Text>
              </View>
              <View style={styles.orderTableHead}>
                <Text style={[styles.orderTableHeadCell, styles.orderColNo]}>#</Text>
                <Text style={[styles.orderTableHeadCell, styles.orderColName]}>Design</Text>
                <Text style={[styles.orderTableHeadCell, styles.orderColSize]}>Size</Text>
                <Text style={[styles.orderTableHeadCell, styles.orderColQty]}>Qty</Text>
                {!hidePrices ? (
                  <>
                    <Text style={[styles.orderTableHeadCell, styles.orderColUnit]}>Unit</Text>
                    <Text style={[styles.orderTableHeadCell, styles.orderColLine]}>Line</Text>
                  </>
                ) : (
                  <Text style={[styles.orderTableHeadCell, { width: "34%" }]}>Ref</Text>
                )}
              </View>
              {lineMeta.map((row, i) => {
                const raw = products[i] as ItemWithPdfImage;
                const barcode = getProductSelectionKey(raw);
                return (
                  <View
                    key={`line-${row.index}`}
                    style={[styles.orderTableRow, i % 2 === 1 ? styles.orderTableRowAlt : {}]}
                  >
                    <Text style={[styles.orderCell, styles.orderColNo]}>{i + 1}</Text>
                    <Text style={[styles.orderCell, styles.orderColName]}>{row.name}</Text>
                    <Text style={[styles.orderCell, styles.orderColSize]}>
                      {row.sizeText || "—"}
                    </Text>
                    <Text style={[styles.orderCellQty, styles.orderColQty]}>
                      {row.shareQty} pc{row.shareQty !== 1 ? "s" : ""}
                    </Text>
                    {!hidePrices ? (
                      <>
                        <Text style={[styles.orderCell, styles.orderColUnit]}>
                          {row.unitPriceStr ? `Rs. ${row.unitPriceStr}` : "—"}
                        </Text>
                        <Text style={[styles.orderCellLine, styles.orderColLine]}>
                          {row.lineTotalStr ? `Rs. ${row.lineTotalStr}` : "—"}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.orderCell, { width: "34%", fontSize: 7 }]}>
                        {barcode || "—"}
                      </Text>
                    )}
                  </View>
                );
              })}
              <View style={styles.orderTableFoot}>
                <Text style={styles.orderTableFootText}>
                  Total · {totalPieces} pc{totalPieces !== 1 ? "s" : ""} · {designCount} design
                  {designCount !== 1 ? "s" : ""}
                </Text>
                {!hidePrices && orderTotalInr > 0 ? (
                  <Text style={styles.orderTableFootTotal}>
                    Rs. {Math.round(orderTotalInr).toLocaleString("en-IN")}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {pageIndex === 0 && chunk.length > 0 ? (
            <Text style={styles.photosTitle}>Product photos</Text>
          ) : null}

          <View style={styles.grid}>
            {chunk.map((raw, i) => {
              const globalIndex = pageIndex * PER_PAGE + i;
              const p = raw as ItemWithPdfImage;
              const meta = lineMeta[globalIndex];
              const name = meta?.name ?? displayName(p);
              const img = p.pdfImageSrc;
              const barcode = getProductSelectionKey(p);
              const key = `${barcode || String(p.id ?? globalIndex)}-${pageIndex}-${i}`;
              const barcodeText =
                barcode && String(barcode).trim() !== "" ? String(barcode) : "-";
              const sizeText = meta?.sizeText ?? null;
              const shareQty = meta?.shareQty ?? 1;
              const weightText = getCustomerDisplayWeightLabel(p);
              const showPrices =
                !hidePrices && resellerPdfPricing && resellerPdfPricing.rates != null;
              let lineTotalStr = meta?.lineTotalStr ?? null;
              let unitPriceStr = meta?.unitPriceStr ?? null;
              let compareAtStr: string | null = null;
              let showInclGst = false;
              if (showPrices && resellerPdfPricing) {
                const mk = Math.max(0, Number(resellerPdfPricing.markupPercentage) || 0);
                const disc = Math.max(0, Number(resellerPdfPricing.discountPercentage) || 0);
                const giftingGstEnabled = resellerPdfPricing.giftingGstEnabled !== false;
                const price = computeSharedCatalogUnitPrice(
                  p,
                  resellerPdfPricing.rates,
                  mk,
                  resellerPdfPricing.wholesale ?? undefined,
                  giftingGstEnabled,
                  disc,
                );
                showInclGst = price.showInclGst;
                if (
                  price.unitCompareAtInr != null &&
                  price.unitCompareAtInr > price.unitTotalInr
                ) {
                  compareAtStr = price.unitCompareAtInr.toLocaleString("en-IN");
                }
                if (!lineTotalStr) {
                  const unitInr = price.unitTotalInr;
                  lineTotalStr = (unitInr * shareQty).toLocaleString("en-IN");
                  unitPriceStr = unitInr.toLocaleString("en-IN");
                }
              }
              const boxAdd = getProductBoxCharges(p as Item);
              const withBoxNote =
                showPrices && boxAdd > 0 && lineTotalStr
                  ? `With box · Rs. ${(Number(lineTotalStr.replace(/,/g, "")) + boxAdd * shareQty).toLocaleString("en-IN")}`
                  : null;
              return (
                <View key={key} style={styles.card}>
                  <View style={styles.thumbWrap}>
                    {img ? (
                      <Image style={styles.thumb} src={img} />
                    ) : (
                      <Text style={styles.thumbPlaceholder}>{name.charAt(0)}</Text>
                    )}
                    <View style={styles.qtyOverlay}>
                      <Text style={styles.qtyOverlayText}>
                        ×{shareQty}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.productName}>{name}</Text>
                  {sizeText ? <Text style={styles.sizeLine}>Size · {sizeText}</Text> : null}
                  <Text style={styles.refLine}>Ref · {barcodeText}</Text>
                  {weightText ? (
                    <Text style={styles.weightLine}>Weight · {weightText}</Text>
                  ) : null}
                  {lineTotalStr ? (
                    <>
                      {shareQty > 1 && unitPriceStr ? (
                        <Text style={styles.unitPriceLine}>
                          {shareQty} × Rs. {unitPriceStr} each
                        </Text>
                      ) : null}
                      {compareAtStr ? (
                        <Text style={styles.priceCompare}>Rs. {compareAtStr}</Text>
                      ) : null}
                      <Text style={styles.priceLine}>Rs. {lineTotalStr}</Text>
                      {withBoxNote ? (
                        <Text style={styles.weightLine}>{withBoxNote}</Text>
                      ) : null}
                      {showInclGst ? (
                        <Text style={styles.priceGst}>incl. GST</Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Text style={styles.footer} fixed>
            {brandName} · Page {pageIndex + 1} of {chunks.length}
          </Text>
        </Page>
      ))}
    </Document>
  );
}
