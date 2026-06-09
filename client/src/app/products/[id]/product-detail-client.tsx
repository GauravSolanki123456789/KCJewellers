"use client";

import axios from "@/lib/axios";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  CATALOG_PATH,
  CATALOG_SCROLL_TO_KEY,
  CATALOG_STATE_KEY,
  CATALOG_FROM_PRODUCT_KEY,
} from "@/lib/routes";
import { buildCatalogSegmentPath } from "@/lib/catalog-paths";
import { inferCatalogMetalParam } from "@/lib/catalog-navigation";
import BreakdownModal from "@/components/BreakdownModal";
import HoverZoomImage from "@/components/HoverZoomImage";
import WhatsAppShareButton from "@/components/WhatsAppShareButton";
import { ratesApiQueryForStorefront } from "@/lib/storefront-domain";
import {
  calculateBreakdown,
  getCustomerDisplaySize,
  getCustomerDisplayWeight,
  getCustomerDisplayPurity,
  isDiamondItem,
  isFixedPriceCatalogItem,
  productPriceShowsInclGst,
  type Item,
} from "@/lib/pricing";
import { useCatalogPricingSettings } from "@/context/CatalogPricingSettingsContext";
import { detailProductImageClass } from "@/lib/product-image-classes";
import {
  analyzeProductImage,
  shouldAnalyzeImageSurface,
  type ProductImageAnalysis,
} from "@/lib/detect-image-surface";
import {
  isFlatProductImageTone,
  productImageViewportWrapperClass,
} from "@/lib/flat-product-image";
import {
  productImageEmptyWellClass,
  productImageWellClass,
} from "@/lib/product-image-theme";
import { productShareMessage } from "@/lib/whatsapp";
import { trackProductView, trackAddToCart } from "@/components/GoogleAnalytics";
import { getSocket } from "@/lib/socket";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { useCart } from "@/context/CartContext";
import { useCustomerTier } from "@/context/CustomerTierContext";
import {
  normalizeStorefrontProductId,
  productMatchesStorefrontId,
} from "@/lib/catalog-product-filters";
import { cn } from "@/lib/utils";
import { normalizeCatalogImageSrc } from "@/lib/normalize-image-url";
import GiftingSizeVariantPicker from "@/components/catalog/GiftingSizeVariantPicker";
import BoxOptionToggle from "@/components/catalog/BoxOptionToggle";
import {
  boxImageSlideIndex,
  giftingDisplayTotal,
  productHasBoxOption,
} from "@/lib/product-box-pricing";
import {
  findVariantByBarcode,
  sortSizeVariants,
  variantDisplayTitle,
} from "@/lib/product-variants";
import { getProductSelectionKey } from "@/lib/catalog-product-filters";

type RateRow = {
  metal_type?: string;
  display_rate?: number;
  sell_rate?: number;
};
type ProductNeighbors = { prev: string | null; next: string | null };

function productDisplayName(p: Item | null): string {
  if (!p) return "Product";
  return variantDisplayTitle(p);
}

export default function ProductDetailClient({
  id,
  initialProduct = null,
}: {
  id: string;
  initialProduct?: Item | null;
}) {
  const router = useRouter();
  const [product, setProduct] = useState<Item | null>(initialProduct ?? null);
  const [sizeVariants, setSizeVariants] = useState<Item[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not_found">(
    initialProduct ? "ready" : "loading",
  );
  const [open, setOpen] = useState(false);
  const [b, setB] = useState<ReturnType<typeof calculateBreakdown> | null>(null);
  const [neighbors, setNeighbors] = useState<ProductNeighbors>({
    prev: null,
    next: null,
  });
  const cart = useCart();
  const { wholesalePricing, hasWholesaleAccess } = useCustomerTier();
  const { pricingOptions } = useCatalogPricingSettings();
  const showInclGst = product ? productPriceShowsInclGst(product, pricingOptions) : true;
  const productRef = useRef<Item | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<ProductImageAnalysis | null>(null);
  const [pdpImageUnoptimized, setPdpImageUnoptimized] = useState(true);
  const [includeBox, setIncludeBox] = useState(false);

  useEffect(() => {
    setImageAnalysis(null);
    setPdpImageUnoptimized(true);
  }, [id, product?.image_url, product?.secondary_image_url, product?.box_image_url, product?.video_url]);

  useEffect(() => {
    setIncludeBox(false);
  }, [id, product?.barcode, product?.sku]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const safeId = normalizeStorefrontProductId(id);
      if (!safeId) {
        if (!cancelled) {
          setProduct(null);
          setLoadState("not_found");
        }
        return;
      }

      const useInitial =
        initialProduct && productMatchesStorefrontId(initialProduct, safeId);

      if (useInitial && initialProduct) {
        if (!cancelled) {
          setProduct(initialProduct);
          productRef.current = initialProduct;
          setLoadState("ready");
        }
      } else if (!cancelled) {
        setLoadState("loading");
      }

      let item: Item | null = useInitial ? initialProduct : null;
      let sortedVariants: Item[] = [];
      try {
        if (!item) {
          const res = await axios.get("/api/products", {
            params: { barcode: safeId, limit: 1 },
          });
          item = Array.isArray(res.data?.items)
            ? res.data.items[0]
            : res.data?.products?.[0] || res.data?.[0] || null;
          const rawVariants = Array.isArray(res.data?.size_variants)
            ? res.data.size_variants
            : [];
          sortedVariants = sortSizeVariants(rawVariants as Item[]);
        } else if (useInitial && initialProduct) {
          try {
            const res = await axios.get("/api/products", {
              params: { barcode: safeId, limit: 1 },
            });
            const rawVariants = Array.isArray(res.data?.size_variants)
              ? res.data.size_variants
              : [];
            sortedVariants = sortSizeVariants(rawVariants as Item[]);
          } catch {
            sortedVariants = [];
          }
        }
        if (cancelled) return;

        if (!cancelled) {
          setSizeVariants(sortedVariants.length > 1 ? sortedVariants : []);
        }

        const resolved =
          item && sortedVariants.length > 1
            ? findVariantByBarcode(sortedVariants, safeId) ?? item
            : item;
        const activeItem = resolved ?? item;
        setProduct(activeItem);
        productRef.current = activeItem;
        setLoadState(activeItem ? "ready" : "not_found");

        const dr = await axios.get(`/api/rates/display${ratesApiQueryForStorefront()}`);
        if (cancelled) return;

        if (activeItem) {
          setB(
            calculateBreakdown(
              activeItem,
              dr.data?.rates || [],
              activeItem.gst_rate ?? 3,
              wholesalePricing,
              pricingOptions,
            ),
          );
          const dn = productDisplayName(activeItem);
          trackProductView(activeItem.barcode || String(activeItem.id || ""), dn);
          axios
            .post("/api/analytics/track", {
              action_type: "view_product",
              target_id: activeItem.barcode || activeItem.sku || String(activeItem.id || ""),
              metadata: { product_name: dn },
            })
            .catch(() => {});
        } else {
          setB(null);
        }
      } catch {
        if (!cancelled) {
          setProduct(null);
          productRef.current = null;
          setB(null);
          setLoadState("not_found");
        }
      }
    };
    load();
    const s = getSocket();
    const on = (p: { rates?: RateRow[] }) => {
      const cur = productRef.current;
      if (cur)
        setB(
          calculateBreakdown(
            cur,
            p?.rates || [],
            cur.gst_rate ?? 3,
            wholesalePricing,
            pricingOptions,
          ),
        );
    };
    s.on("live-rate", on);
    return () => {
      cancelled = true;
      s.off("live-rate", on);
    };
  }, [id, initialProduct, wholesalePricing, pricingOptions]);

  useEffect(() => {
    if (!product) {
      setB(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const dr = await axios.get(`/api/rates/display${ratesApiQueryForStorefront()}`);
        if (cancelled) return;
        setB(
          calculateBreakdown(
            product,
            dr.data?.rates || [],
            product.gst_rate ?? 3,
            wholesalePricing,
            pricingOptions,
          ),
        );
      } catch {
        if (!cancelled) setB(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product, wholesalePricing, pricingOptions]);

  const handleSelectVariant = useCallback(
    (v: Item) => {
      const key = getProductSelectionKey(v);
      if (!key) return;
      setProduct(v);
      productRef.current = v;
      router.replace(`/products/${encodeURIComponent(key)}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    const safeId = normalizeStorefrontProductId(id);
    if (!safeId) return;
    let cancelled = false;
    axios
      .get("/api/products/neighbors", { params: { barcode: safeId } })
      .then((res) => {
        if (cancelled) return;
        setNeighbors({
          prev: res.data?.prev?.barcode ?? null,
          next: res.data?.next?.barcode ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setNeighbors({ prev: null, next: null });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const goToProduct = useCallback(
    (barcode: string) => {
      router.push(`/products/${encodeURIComponent(barcode)}`);
    },
    [router]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && neighbors.prev) {
        e.preventDefault();
        goToProduct(neighbors.prev);
      } else if (e.key === "ArrowRight" && neighbors.next) {
        e.preventDefault();
        goToProduct(neighbors.next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [neighbors, goToProduct]);

  const handleBackToCatalog = useCallback(() => {
    const barcode =
      product?.barcode || product?.sku || String(product?.id ?? id ?? "");
    if (typeof window !== "undefined" && barcode && barcode.length > 0) {
      try {
        sessionStorage.setItem(CATALOG_SCROLL_TO_KEY, barcode);
      } catch {
        /* ignore */
      }
    }
    try {
      if (typeof window !== "undefined") {
        const from = sessionStorage.getItem(CATALOG_FROM_PRODUCT_KEY);
        const hasStored = sessionStorage.getItem(CATALOG_STATE_KEY);
        if (from === "1" && hasStored) {
          router.push(CATALOG_PATH);
          return;
        }
      }
    } catch {
      /* fall through */
    }
    const metal = inferCatalogMetalParam(product);
    const cat = (product as { category_slug?: string }).category_slug;
    const sub = (product as { subcategory_slug?: string }).subcategory_slug;
    if (cat && sub) {
      router.push(buildCatalogSegmentPath(metal, cat, sub));
      return;
    }
    router.push(`${CATALOG_PATH}?metal=${metal}`);
  }, [router, product, id]);

  const handleProductImageLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget;
      if (shouldAnalyzeImageSurface(el)) {
        setImageAnalysis(analyzeProductImage(el));
      }
    },
    [],
  );

  type PdpGallerySlide =
    | { kind: "image"; src: string }
    | { kind: "video"; src: string; poster?: string };

  const gallerySlides = useMemo((): PdpGallerySlide[] => {
    if (!product) return [];
    const primary = product.image_url
      ? normalizeCatalogImageSrc(product.image_url)
      : undefined;
    const sec =
      product.secondary_image_url != null
        ? normalizeCatalogImageSrc(product.secondary_image_url)
        : undefined;
    const box =
      product.box_image_url != null
        ? normalizeCatalogImageSrc(product.box_image_url)
        : undefined;
    const out: PdpGallerySlide[] = [];
    if (primary) out.push({ kind: "image", src: primary });
    if (sec) out.push({ kind: "image", src: sec });
    if (box) out.push({ kind: "image", src: box });
    const videoRaw = String(product.video_url ?? "").trim();
    if (videoRaw) out.push({ kind: "video", src: videoRaw, poster: primary });
    return out;
  }, [product]);

  const boxSlideIdx = product ? boxImageSlideIndex(product) : null;

  const [galleryIdx, setGalleryIdx] = useState(0);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  /** Finger-follow zoom on phones/tablets; desktop keeps hover-only zoom. */
  const [touchPdpZoom, setTouchPdpZoom] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px), (pointer: coarse)");
    const sync = () => setTouchPdpZoom(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setGalleryIdx(0);
    galleryScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [id, product?.image_url, product?.secondary_image_url, product?.box_image_url, product?.video_url]);

  const galleryLen = gallerySlides.length;

  useEffect(() => {
    if (boxSlideIdx != null && galleryIdx === boxSlideIdx) setIncludeBox(true);
    else if (productHasBoxOption(product)) setIncludeBox(false);
  }, [galleryIdx, boxSlideIdx, product]);

  const syncGalleryFromScroll = useCallback(() => {
    const el = galleryScrollRef.current;
    if (!el || galleryLen <= 1) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    setGalleryIdx(Math.max(0, Math.min(galleryLen - 1, Math.round(el.scrollLeft / w))));
  }, [galleryLen]);

  const scrollGalleryTo = useCallback((index: number) => {
    const el = galleryScrollRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    el.scrollTo({ left: index * w, behavior: "smooth" });
    setGalleryIdx(index);
  }, []);

  if (loadState === "loading")
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 animate-spin text-amber-500" aria-hidden />
          <p className="text-sm text-slate-400">Loading product…</p>
        </div>
      </div>
    );

  if (loadState === "not_found" || !product)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
        <p className="text-lg font-semibold text-slate-100">Product not found</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
          This piece may have been removed or the link is outdated. Browse the live catalogue to
          find similar jewellery.
        </p>
        <button
          type="button"
          onClick={() => router.push(CATALOG_PATH)}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-400"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back to catalogue
        </button>
      </div>
    );

  const displayName = productDisplayName(product);
  const styleCode = product.style_code || "";
  const sku = product.sku || product.barcode || "";
  const netWeight = getCustomerDisplayWeight(product)
  const sizeInches = getCustomerDisplaySize(product)
  const purity = getCustomerDisplayPurity(product)
  const metalType = product.metal_type ?? null;
  const isDiamond = isDiamondItem(product);
  const isFixedPrice = isFixedPriceCatalogItem(product);
  const barcode = product.barcode || product.sku || String(product.id || "");
  const hasDiscount = (b?.discountPercent ?? 0) > 0;
  const showWholesale =
    hasWholesaleAccess &&
    b?.is_wholesale_price &&
    b.wholesale_retail_total != null &&
    b.wholesale_retail_total > (b?.total ?? 0) + 0.5;
  const subcategorySlug =
    (product as { subcategory_slug?: string }).subcategory_slug ?? null;
  const isFlatBg = isFlatProductImageTone(imageAnalysis?.tone);
  const detailImgClass = detailProductImageClass(subcategorySlug, {
    flatTone: isFlatBg,
  });
  const activeGallerySlide = gallerySlides[galleryIdx] ?? gallerySlides[0];
  const activeGallerySrc =
    activeGallerySlide?.kind === "image" ? activeGallerySlide.src : activeGallerySlide?.poster;
  const multiGallery = gallerySlides.length > 1;

  const displayPrice = product
    ? giftingDisplayTotal(product, [], includeBox, wholesalePricing, pricingOptions)
    : b?.total || 0;

  const handleAddToCart = () => {
    cart.add({
      ...product,
      id: product.id ? String(product.id) : product.barcode,
      include_box: includeBox,
    });
    trackAddToCart(
      product.barcode || String(product.id || ""),
      displayName,
      displayPrice
    );
  };

  const shareText = productShareMessage({
    name: displayName,
    weightGm: netWeight,
    barcode,
  });

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 pb-32 pt-4 md:mt-8 md:pb-10 md:pt-6">
        <button
          type="button"
          onClick={handleBackToCatalog}
          className="mb-4 inline-flex items-center gap-2 text-slate-400 transition-colors hover:text-amber-500 md:mb-6"
        >
          <ChevronLeft className="size-4" />
          Back to Catalogue
        </button>

        <div className="grid gap-6 md:grid-cols-2 md:gap-10 lg:gap-12">
          <div className="flex min-w-0 flex-col gap-3">
            <div
              className={cn(
                "relative isolate w-full overflow-hidden rounded-2xl border border-white/5 shadow-2xl",
                /** Viewport-capped stage so tall studio shots fit without forcing long scroll (especially mobile). */
                "min-h-[200px] h-[min(52dvh,420px)] sm:h-[min(58dvh,480px)] md:min-h-[320px] md:h-[min(64dvh,640px)] lg:h-[min(68dvh,700px)]",
                productImageWellClass,
              )}
            >
              {neighbors.prev && (
                <button
                  type="button"
                  aria-label="Previous product in catalogue"
                  title="Previous product in this style"
                  onClick={() => goToProduct(neighbors.prev!)}
                  className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-amber-400 shadow-lg backdrop-blur-sm transition-opacity hover:border-amber-500/40 hover:bg-slate-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 md:h-12 md:w-12"
                >
                  <ChevronLeft className="size-5 md:size-7" strokeWidth={2.5} />
                </button>
              )}
              {neighbors.next && (
                <button
                  type="button"
                  aria-label="Next product in catalogue"
                  title="Next product in this style"
                  onClick={() => goToProduct(neighbors.next!)}
                  className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-amber-400 shadow-lg backdrop-blur-sm transition-opacity hover:border-amber-500/40 hover:bg-slate-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 md:h-12 md:w-12"
                >
                  <ChevronRight className="size-5 md:size-7" strokeWidth={2.5} />
                </button>
              )}
              {hasDiscount && (
                <span className="kc-discount-badge right-3 top-3 text-xs">
                  {Math.round(b?.discountPercent ?? 0)}% off
                </span>
              )}
              {activeGallerySrc ? (
                <>
                  {multiGallery ? (
                    <div
                      ref={galleryScrollRef}
                      role="region"
                      aria-label="Product photos — swipe sideways"
                      className={cn(
                        "absolute inset-0 z-[3] flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide kc-gallery-swipe",
                        "md:rounded-2xl",
                      )}
                      onScroll={syncGalleryFromScroll}
                    >
                      {gallerySlides.map((slide, i) => (
                        <div
                          key={`${slide.kind}-${slide.src}-${i}`}
                          className="relative h-full min-w-full shrink-0 grow-0 basis-full snap-center snap-always"
                        >
                          {slide.kind === "video" ? (
                            <div
                              className={cn(
                                "relative flex h-full w-full items-center justify-center bg-slate-950",
                                productImageViewportWrapperClass(),
                              )}
                            >
                              <video
                                src={slide.src}
                                poster={slide.poster}
                                className="h-full w-full object-contain"
                                controls
                                playsInline
                                preload="metadata"
                              />
                            </div>
                          ) : (
                            <div className={cn("relative h-full w-full", productImageViewportWrapperClass())}>
                              <HoverZoomImage swipeFriendly touchZoom={touchPdpZoom}>
                                <Image
                                  key={`${slide.src}-${pdpImageUnoptimized ? "u" : "o"}`}
                                  src={slide.src}
                                  alt={i === 0 ? displayName : `${displayName} — alternate view`}
                                  fill
                                  sizes="(max-width: 1024px) 100vw, 50vw"
                                  className={detailImgClass}
                                  unoptimized={pdpImageUnoptimized}
                                  priority={i === 0}
                                  fetchPriority={i === 0 ? "high" : "auto"}
                                  decoding="async"
                                  draggable={false}
                                  onLoad={i === 0 ? handleProductImageLoad : undefined}
                                  onError={() => {
                                    if (!pdpImageUnoptimized) setPdpImageUnoptimized(true);
                                  }}
                                />
                              </HoverZoomImage>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={cn("absolute inset-0 z-[3]", productImageViewportWrapperClass())}>
                      <HoverZoomImage touchZoom={touchPdpZoom}>
                        <Image
                          key={`${activeGallerySrc}-${pdpImageUnoptimized ? "u" : "o"}`}
                          src={activeGallerySrc}
                          alt={displayName}
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className={detailImgClass}
                          unoptimized={pdpImageUnoptimized}
                          priority
                          fetchPriority="high"
                          decoding="async"
                          draggable={false}
                          onLoad={handleProductImageLoad}
                          onError={() => {
                            if (!pdpImageUnoptimized) setPdpImageUnoptimized(true);
                          }}
                        />
                      </HoverZoomImage>
                    </div>
                  )}
                  {multiGallery && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute bottom-3 left-0 right-0 z-[12] flex justify-center gap-1.5 md:bottom-4"
                    >
                      {gallerySlides.map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1 rounded-full transition-all duration-300",
                            galleryIdx === i
                              ? "w-5 bg-amber-500 shadow-sm"
                              : "w-1 bg-white/50",
                          )}
                        />
                      ))}
                    </div>
                  )}
                  <span className="pointer-events-none absolute bottom-3 left-3 z-10 hidden text-[10px] uppercase tracking-wider text-slate-500 md:block">
                    {multiGallery ? "Swipe or use thumbnails" : "Hover to zoom"}
                  </span>
                </>
              ) : (
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-3",
                    productImageEmptyWellClass,
                  )}
                >
                  <Loader2 className="size-8 text-slate-400" aria-hidden />
                  <span className="sr-only">{displayName} — awaiting photo</span>
                </div>
              )}
            </div>
            {multiGallery && (
              <div
                className="hidden gap-2 md:flex"
                role="tablist"
                aria-label="Product photos"
              >
                {gallerySlides.map((slide, i) => (
                  <button
                    key={`${slide.kind}-${slide.src}-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={galleryIdx === i}
                    aria-label={
                      slide.kind === "video"
                        ? "Product video"
                        : i === 0
                          ? "Front photo"
                          : "Alternate photo"
                    }
                    onClick={() => scrollGalleryTo(i)}
                    className={cn(
                      "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-all lg:h-[4.75rem] lg:w-[4.75rem]",
                      galleryIdx === i
                        ? "border-amber-500 shadow-md shadow-amber-500/20 ring-2 ring-amber-500/35 ring-offset-2 ring-offset-slate-950"
                        : "border-slate-700 opacity-90 hover:border-amber-500/55 hover:opacity-100",
                      productImageWellClass,
                    )}
                  >
                    {slide.kind === "video" ? (
                      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        Video
                      </div>
                    ) : (
                      <div className={productImageViewportWrapperClass()}>
                        <Image
                          src={slide.src}
                          alt=""
                          fill
                          sizes="80px"
                          className={detailImgClass}
                          unoptimized={pdpImageUnoptimized}
                        />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col pb-4 md:pb-0">
            {barcode && (
              <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">
                {barcode}
              </span>
            )}
            <h1 className="kc-page-title mt-1 text-2xl md:text-3xl tracking-tight">
              {displayName}
            </h1>
            {styleCode && (
              <span className="text-sm text-slate-500 mt-1">
                {styleCode}
                {sku ? ` · ${sku}` : ""}
              </span>
            )}

            {sizeVariants.length > 1 && product ? (
              <div className="mt-6 rounded-xl border border-slate-700/80 bg-slate-950/[0.03] p-4">
                <GiftingSizeVariantPicker
                  variants={sizeVariants}
                  selected={product}
                  onSelect={handleSelectVariant}
                  density="detail"
                />
              </div>
            ) : null}

            {productHasBoxOption(product) ? (
              <div className="mt-4">
                <BoxOptionToggle
                  item={product}
                  includeBox={includeBox}
                  onChange={(withBox) => {
                    setIncludeBox(withBox);
                    if (withBox && boxSlideIdx != null) scrollGalleryTo(boxSlideIdx);
                    else scrollGalleryTo(0);
                  }}
                  density="detail"
                />
              </div>
            ) : null}

            <div className="mt-6">
              {showWholesale && (
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                  Wholesale rate
                </p>
              )}
              {showWholesale && (
                <span className="line-through text-slate-500 text-xl mr-2">
                  ₹{Math.round(b?.wholesale_retail_total ?? 0).toLocaleString("en-IN")}
                </span>
              )}
              {!showWholesale && hasDiscount && (
                <span className="line-through text-slate-500 text-xl mr-2">
                  ₹{Math.round(b?.originalTotal ?? 0).toLocaleString("en-IN")}
                </span>
              )}
              <span
                className={`text-3xl md:text-4xl font-bold tabular-nums ${
                  showWholesale ? "text-emerald-400" : "text-amber-500"
                }`}
              >
                ₹{Math.round(displayPrice).toLocaleString("en-IN")}
              </span>
              {includeBox && productHasBoxOption(product) ? (
                <span className="ml-2 text-xs font-medium uppercase tracking-wide text-emerald-400">
                  with box
                </span>
              ) : null}
              {showInclGst ? (
                <span className="ml-2 text-base font-normal text-slate-500">
                  incl. GST
                </span>
              ) : null}
              <button
                type="button"
                className="mt-2 block text-xs font-medium tracking-wide text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline md:hidden"
                onClick={() => setOpen(true)}
              >
                View price breakdown
              </button>
            </div>

            {isDiamond && (
              <div className="mt-6 rounded-xl bg-slate-900/60 border border-amber-500/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/80">
                  <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                    Diamond Specifications
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-800/50">
                  {(product as { diamond_carat?: string }).diamond_carat && (
                    <div className="bg-slate-900/80 px-4 py-3">
                      <span className="text-xs text-slate-500 block">Carat</span>
                      <span className="text-slate-100 font-medium">
                        {(product as { diamond_carat?: string }).diamond_carat}
                      </span>
                    </div>
                  )}
                  {(product as { diamond_cut?: string }).diamond_cut && (
                    <div className="bg-slate-900/80 px-4 py-3">
                      <span className="text-xs text-slate-500 block">Cut</span>
                      <span className="text-slate-100 font-medium">
                        {(product as { diamond_cut?: string }).diamond_cut}
                      </span>
                    </div>
                  )}
                  {(product as { diamond_color?: string }).diamond_color && (
                    <div className="bg-slate-900/80 px-4 py-3">
                      <span className="text-xs text-slate-500 block">Color</span>
                      <span className="text-slate-100 font-medium">
                        {(product as { diamond_color?: string }).diamond_color}
                      </span>
                    </div>
                  )}
                  {(product as { diamond_clarity?: string }).diamond_clarity && (
                    <div className="bg-slate-900/80 px-4 py-3">
                      <span className="text-xs text-slate-500 block">
                        Clarity
                      </span>
                      <span className="text-slate-100 font-medium">
                        {
                          (product as { diamond_clarity?: string })
                            .diamond_clarity
                        }
                      </span>
                    </div>
                  )}
                </div>
                {(product as { certificate_url?: string }).certificate_url && (
                  <div className="p-4 border-t border-slate-800/80">
                    <a
                      href={(product as { certificate_url?: string }).certificate_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-semibold hover:bg-amber-500/30 transition-colors"
                    >
                      View Authenticity Certificate
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {netWeight != null && (
                <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block">
                    Net Weight
                  </span>
                  <span className="text-slate-100 font-medium">
                    {Number(netWeight).toFixed(2)} gm
                  </span>
                </div>
              )}
              {purity != null && (
                <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block">
                    Purity
                  </span>
                  <span className="text-slate-100 font-medium">
                    {String(purity)}
                  </span>
                </div>
              )}
              {metalType && (
                <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block">
                    Metal Type
                  </span>
                  <span className="text-slate-100 font-medium capitalize">
                    {String(metalType)}
                  </span>
                </div>
              )}
              {sizeInches && sizeVariants.length <= 1 ? (
                <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block">
                    Size (inches)
                  </span>
                  <span className="text-slate-100 font-medium">{sizeInches}</span>
                </div>
              ) : null}
              {barcode && (
                <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block">
                    Barcode
                  </span>
                  <span className="text-slate-100 font-medium font-mono text-sm">
                    {barcode}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 hidden flex-col gap-3 md:flex">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  className="kc-btn-primary order-2 w-full px-6 py-3.5 sm:order-1 sm:w-auto sm:!inline-block sm:!w-auto"
                  onClick={handleAddToCart}
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  className="order-1 w-full rounded-xl border border-slate-700/50 bg-white/70 px-6 py-3 font-medium tracking-wide text-slate-100 transition-colors hover:border-slate-600 hover:bg-white sm:order-2 sm:w-auto"
                  onClick={() => setOpen(true)}
                >
                  View Breakdown
                </button>
              </div>
              <WhatsAppShareButton
                message={shareText}
                className="w-full sm:w-auto"
              />
            </div>
          </div>
        </div>

        <div className="kc-pdp-sticky-bar kc-bottom-above-mobile-nav fixed left-0 right-0 z-30 px-4 py-3 safe-area-pb md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold tabular-nums text-slate-100">
                ₹{Math.round(b?.total || 0).toLocaleString("en-IN")}
              </p>
              {showInclGst ? (
                <p className="text-[10px] text-slate-500">incl. GST</p>
              ) : null}
            </div>
            <button
              type="button"
              className="kc-btn-primary shrink-0 !w-auto px-6 py-3"
              onClick={handleAddToCart}
            >
              Add to Cart
            </button>
          </div>
        </div>
        {b && (
          <BreakdownModal
            open={open}
            onClose={() => setOpen(false)}
            breakdown={b}
            productName={displayName}
            isFixedPrice={isFixedPrice}
          />
        )}
      </div>
    </div>
  );
}
