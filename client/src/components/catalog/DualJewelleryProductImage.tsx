"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeCatalogImageSrc } from "@/lib/normalize-image-url";
import { catalogProductImageClass } from "@/lib/product-image-classes";
import { productImageViewportWrapperClass } from "@/lib/flat-product-image";
import {
  productImageEmptyWellClass,
  productImageLoadingShimmerClass,
} from "@/lib/product-image-theme";

function ProductImageSkeleton({ label }: { label?: string }) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-200",
          productImageLoadingShimmerClass,
        )}
      />
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-200"
        aria-hidden
      >
        <Loader2 className="size-7 animate-spin text-slate-400/80" />
        {label ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {label}
          </span>
        ) : null}
      </div>
    </>
  );
}

type SlideImageProps = {
  src: string;
  alt: string;
  sizes: string;
  subcategorySlug: string | null;
  imageClassName?: string;
  unoptimized: boolean;
  priority: boolean;
  fetchPriority?: "high" | "low" | "auto";
  hoverFx?: boolean;
  onLoad: () => void;
  onError: () => void;
  imageKey: string;
};

function SlideImage({
  src,
  alt,
  sizes,
  subcategorySlug,
  imageClassName,
  unoptimized,
  priority,
  fetchPriority,
  hoverFx = false,
  onLoad,
  onError,
  imageKey,
}: SlideImageProps) {
  return (
    <div className={cn("relative h-full w-full", productImageViewportWrapperClass())}>
      <Image
        key={imageKey}
        src={src}
        alt={alt}
        fill
        quality={72}
        sizes={sizes}
        className={cn(
          catalogProductImageClass(subcategorySlug),
          hoverFx &&
            "transition-[filter,transform] duration-300 ease-out md:group-hover:brightness-105 md:group-hover:scale-[1.02]",
          imageClassName,
        )}
        unoptimized={unoptimized}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        fetchPriority={fetchPriority}
        draggable={false}
        onLoad={onLoad}
        onError={onError}
      />
    </div>
  );
}

/** Passive dots — visual only; swipe/scroll changes the active slide. */
function GalleryDots({ count, active }: { count: number; active: number }) {
  if (count <= 1) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-2.5 left-0 right-0 z-30 flex justify-center gap-1.5"
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 rounded-full transition-all duration-300",
            i === active ? "w-4 bg-amber-500/95 shadow-sm" : "w-1 bg-white/55",
          )}
        />
      ))}
    </div>
  );
}

type DualJewelleryProductImageProps = {
  primarySrc: string;
  /** Raw DB / API field `secondary_image_url` (normalized inside). */
  secondary_image_url?: string | null;
  alt: string;
  sizes: string;
  subcategorySlug?: string | null;
  priority?: boolean;
  fetchPriority?: "high" | "low" | "auto";
  imageClassName?: string;
  unoptimized?: boolean;
};

/**
 * Catalogue grid image: swipe sideways on touch to see `secondary_image_url`;
 * hover cross-fade on md+ desktops. Uses DB fields `image_url` + `secondary_image_url`.
 */
export default function DualJewelleryProductImage({
  primarySrc,
  secondary_image_url,
  alt,
  sizes,
  subcategorySlug = null,
  priority = false,
  fetchPriority,
  imageClassName,
  unoptimized = false,
}: DualJewelleryProductImageProps) {
  const secondaryNorm =
    normalizeCatalogImageSrc(
      secondary_image_url == null ? undefined : String(secondary_image_url),
    ) || undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef({ x: 0, moved: false });

  const [primErr, setPrimErr] = useState(false);
  const [secErr, setSecErr] = useState(false);
  const [fallbackPrimUnopt, setFallbackPrimUnopt] = useState(false);
  const [fallbackSecUnopt, setFallbackSecUnopt] = useState(false);
  const [primLoaded, setPrimLoaded] = useState(false);
  const [secLoaded, setSecLoaded] = useState(false);
  const [mobileIdx, setMobileIdx] = useState(0);
  /** Desktop hover: show secondary on pointer over. */
  const [hoverBack, setHoverBack] = useState(false);

  useEffect(() => {
    setPrimErr(false);
    setSecErr(false);
    setFallbackPrimUnopt(false);
    setFallbackSecUnopt(false);
    setPrimLoaded(false);
    setSecLoaded(false);
    setMobileIdx(0);
    setHoverBack(false);
    scrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [primarySrc, secondaryNorm]);

  const showDualUi = !!(secondaryNorm && !secErr);
  const fetchP = fetchPriority ?? (priority ? "high" : undefined);

  const syncIdxFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    setMobileIdx(Math.round(el.scrollLeft / w));
  }, []);

  const blockLinkAfterSwipe = useCallback((e: MouseEvent) => {
    if (touchRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const onTouchStart = useCallback((e: TouchEvent) => {
    touchRef.current = { x: e.touches[0]?.clientX ?? 0, moved: false };
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const x = e.touches[0]?.clientX ?? 0;
    if (Math.abs(x - touchRef.current.x) > 10) {
      touchRef.current.moved = true;
    }
  }, []);

  if (!primarySrc) return null;

  if (primErr) {
    return (
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-2",
          productImageEmptyWellClass,
        )}
      >
        <Loader2 className="size-6 text-slate-400 opacity-70" aria-hidden />
        <span className="px-4 text-center text-xs text-slate-500">Photo unavailable</span>
      </div>
    );
  }

  if (!showDualUi) {
    return (
      <>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-[2] transition-opacity duration-300",
            primLoaded ? "opacity-0" : "opacity-100",
          )}
        >
          <ProductImageSkeleton label="Loading" />
        </div>
        <div className={productImageViewportWrapperClass()}>
          <Image
            key={`${primarySrc}-${fallbackPrimUnopt ? "u" : "o"}`}
            src={primarySrc}
            alt={alt}
            fill
            quality={72}
            sizes={sizes}
            className={cn(
              catalogProductImageClass(subcategorySlug),
              "transition-[filter,transform] duration-300 ease-out group-hover:brightness-105 group-hover:scale-[1.02]",
              imageClassName,
            )}
            unoptimized={unoptimized || fallbackPrimUnopt}
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            priority={priority}
            fetchPriority={fetchP}
            draggable={false}
            onLoad={() => setPrimLoaded(true)}
            onError={() => {
              if (!fallbackPrimUnopt) {
                setFallbackPrimUnopt(true);
                return;
              }
              setPrimErr(true);
            }}
          />
        </div>
      </>
    );
  }

  const primKey = `p-${primarySrc}-${fallbackPrimUnopt ? "u" : "o"}`;
  const secKey = `s-${secondaryNorm}-${fallbackSecUnopt ? "u" : "o"}`;

  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-[5] transition-opacity duration-300",
          (mobileIdx === 1 ? secLoaded : primLoaded) ? "opacity-0" : "opacity-100",
          "md:opacity-0 md:pointer-events-none",
        )}
      >
        <ProductImageSkeleton label="Loading" />
      </div>

      {/* Mobile / tablet: horizontal snap scroll (swipe for alternate view). */}
      <div
        ref={scrollRef}
        role="region"
        aria-label="Product photos — swipe sideways"
        className="absolute inset-0 z-[4] flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide kc-scroll-contain touch-pan-x md:hidden"
        onScroll={syncIdxFromScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onClickCapture={blockLinkAfterSwipe}
      >
        <div className="relative h-full w-full shrink-0 snap-center snap-always">
          <SlideImage
            src={primarySrc}
            alt={alt}
            sizes={sizes}
            subcategorySlug={subcategorySlug}
            imageClassName={imageClassName}
            unoptimized={unoptimized || fallbackPrimUnopt}
            priority={priority}
            fetchPriority={fetchP}
            imageKey={primKey}
            onLoad={() => setPrimLoaded(true)}
            onError={() => {
              if (!fallbackPrimUnopt) {
                setFallbackPrimUnopt(true);
                return;
              }
              setPrimErr(true);
            }}
          />
        </div>
        <div className="relative h-full w-full shrink-0 snap-center snap-always">
          <SlideImage
            src={secondaryNorm!}
            alt={`${alt} — alternate view`}
            sizes={sizes}
            subcategorySlug={subcategorySlug}
            imageClassName={imageClassName}
            unoptimized={unoptimized || fallbackSecUnopt}
            priority={priority}
            fetchPriority={priority ? "low" : fetchP}
            imageKey={secKey}
            onLoad={() => setSecLoaded(true)}
            onError={() => {
              if (!fallbackSecUnopt) {
                setFallbackSecUnopt(true);
                return;
              }
              setSecErr(true);
            }}
          />
        </div>
      </div>

      {/* Desktop: cross-fade on hover (no click toggles). */}
      <div
        className="absolute inset-0 z-[3] hidden md:block"
        onMouseEnter={() => setHoverBack(true)}
        onMouseLeave={() => setHoverBack(false)}
      >
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 ease-out",
            hoverBack ? "opacity-0" : "opacity-100",
          )}
        >
          <SlideImage
            src={primarySrc}
            alt={alt}
            sizes={sizes}
            subcategorySlug={subcategorySlug}
            imageClassName={imageClassName}
            unoptimized={unoptimized || fallbackPrimUnopt}
            priority={priority}
            fetchPriority={fetchP}
            hoverFx
            imageKey={`desk-${primKey}`}
            onLoad={() => setPrimLoaded(true)}
            onError={() => {
              if (!fallbackPrimUnopt) {
                setFallbackPrimUnopt(true);
                return;
              }
              setPrimErr(true);
            }}
          />
        </div>
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 ease-out",
            hoverBack ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <SlideImage
            src={secondaryNorm!}
            alt={`${alt} — alternate view`}
            sizes={sizes}
            subcategorySlug={subcategorySlug}
            imageClassName={imageClassName}
            unoptimized={unoptimized || fallbackSecUnopt}
            priority={priority}
            fetchPriority="low"
            imageKey={`desk-${secKey}`}
            onLoad={() => setSecLoaded(true)}
            onError={() => {
              if (!fallbackSecUnopt) {
                setFallbackSecUnopt(true);
                return;
              }
              setSecErr(true);
            }}
          />
        </div>
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-md bg-slate-950/75 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 backdrop-blur-sm">
          Hover for alt
        </span>
      </div>

      <GalleryDots count={2} active={mobileIdx} />
    </>
  );
}
