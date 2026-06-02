import { useMemo } from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import {
  getCustomerDisplayWeightWithGrossFallback,
  productPriceShowsInclGst,
  type CatalogPricingOptions,
  type Item,
  type WholesalePricingInput,
} from "@/lib/pricing";
import { sharedCatalogMarkedUpTotalInr } from "@/lib/shared-catalog-pricing";
import { getProductSelectionKey } from "@/lib/catalog-product-filters";
import type { ItemWithPdfImage } from "@/lib/pdf-embed-images";
import { getKcPdfPalette, type KcPdfPalette } from "@/lib/kc-pdf-palette";

function buildCatalogPdfStyles(p: KcPdfPalette) {
  return StyleSheet.create({
    page: {
      padding: 28,
      backgroundColor: p.pageBg,
      fontFamily: "Helvetica",
    },
    header: {
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: p.headerRule,
      paddingBottom: 12,
    },
    brand: { fontSize: 18, color: p.brand, fontWeight: "bold" },
    sub: { fontSize: 9, color: p.subMuted, marginTop: 4 },
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
      height: 100,
      backgroundColor: p.thumbBg,
      borderRadius: 6,
      marginBottom: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    thumb: {
      width: "100%",
      height: 100,
      objectFit: "cover",
      borderRadius: 6,
    },
    thumbPlaceholder: {
      fontSize: 28,
      color: p.metaLabel,
      fontWeight: "bold",
    },
    title: {
      fontSize: 8,
      color: p.textPrimary,
      marginBottom: 2,
      marginTop: 2,
    },
    metaLabel: {
      fontSize: 6,
      color: p.metaLabel,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    barcodeValue: {
      fontSize: 11,
      color: p.accent,
      fontFamily: "Helvetica",
      fontWeight: "bold",
      marginBottom: 3,
    },
    weightLine: { fontSize: 8, color: p.textSecondary, marginBottom: 2 },
    weightMuted: { fontSize: 8, color: p.metaLabel },
    priceLine: {
      fontSize: 11,
      color: p.accent,
      fontFamily: "Helvetica",
      fontWeight: "bold",
      marginTop: 2,
      marginBottom: 2,
    },
    priceGst: {
      fontSize: 8,
      color: p.textSecondary,
      marginBottom: 3,
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
  /** Mirrors logged-in reseller catalogue pricing before brochure markup. */
  wholesale?: WholesalePricingInput | null;
  /** Site-wide gift GST toggle — same as shared catalogue API. */
  giftingGstEnabled?: boolean;
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
};

const PER_PAGE = 9;

export function CatalogPdfDocument({
  products,
  brandName = "KC Jewellers",
  resellerPdfPricing = null,
  kcThemeId = null,
  itemsLabel = "Catalogue",
  hidePrices = false,
}: CatalogPdfDocumentProps) {
  const palette = useMemo(() => getKcPdfPalette(kcThemeId || undefined), [kcThemeId]);
  const styles = useMemo(() => buildCatalogPdfStyles(palette), [palette]);

  const chunks: ItemWithPdfImage[][] = [];
  for (let i = 0; i < products.length; i += PER_PAGE) {
    chunks.push(products.slice(i, i + PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  return (
    <Document>
      {chunks.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {pageIndex === 0 && (
            <View style={styles.header}>
              <Text style={styles.brand}>{brandName}</Text>
              <Text style={styles.sub}>
                {itemsLabel} · {products.length} item{products.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          <View style={styles.grid}>
            {chunk.map((raw, i) => {
              const p = raw as ItemWithPdfImage;
              const name = displayName(p);
              const img = p.pdfImageSrc;
              const barcode = getProductSelectionKey(p);
              const weight = getCustomerDisplayWeightWithGrossFallback(p);
              const key = `${barcode || String(p.id ?? i)}-${pageIndex}-${i}`;
              const barcodeText =
                barcode && String(barcode).trim() !== "" ? String(barcode) : "-";
              const weightText =
                weight != null && !Number.isNaN(Number(weight))
                  ? `${Number(weight).toFixed(2)} gm`
                  : null;
              const showPrices =
                !hidePrices && resellerPdfPricing && resellerPdfPricing.rates != null;
              let amountStr: string | null = null;
              let qtyLabel: string | null = null;
              let showInclGst = false;
              if (showPrices) {
                const mk = Math.max(0, Number(resellerPdfPricing.markupPercentage) || 0);
                const giftingGstEnabled = resellerPdfPricing.giftingGstEnabled !== false;
                const unitInr = sharedCatalogMarkedUpTotalInr(
                  p,
                  resellerPdfPricing.rates,
                  mk,
                  resellerPdfPricing.wholesale ?? undefined,
                  giftingGstEnabled,
                );
                const pricingOptions: CatalogPricingOptions = { giftingGstEnabled };
                showInclGst = productPriceShowsInclGst(p, pricingOptions);
                const shareQty = Math.max(
                  1,
                  Math.floor(Number((p as { shareCatalogQty?: number }).shareCatalogQty) || 1),
                );
                const lineInr = unitInr * shareQty;
                amountStr = lineInr.toLocaleString("en-IN");
                if (shareQty > 1) {
                  qtyLabel = `Qty · ${shareQty} · ₹${unitInr.toLocaleString("en-IN")} each`;
                }
              }
              return (
                <View key={key} style={styles.card}>
                  <View style={styles.thumbWrap}>
                    {img ? (
                      <Image style={styles.thumb} src={img} />
                    ) : (
                      <Text style={styles.thumbPlaceholder}>{name.charAt(0)}</Text>
                    )}
                  </View>
                  <Text style={styles.metaLabel}>Barcode</Text>
                  <Text style={styles.barcodeValue}>{barcodeText}</Text>
                  {weightText ? (
                    <Text style={styles.weightLine}>Weight · {weightText}</Text>
                  ) : null}
                  {amountStr ? (
                    <>
                      {qtyLabel ? (
                        <Text style={styles.weightLine}>{qtyLabel}</Text>
                      ) : null}
                      <Text style={styles.priceLine}>Rs. {amountStr}</Text>
                      {showInclGst ? (
                        <Text style={styles.priceGst}>incl. GST</Text>
                      ) : null}
                    </>
                  ) : null}
                  <Text style={styles.title}>{name}</Text>
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
