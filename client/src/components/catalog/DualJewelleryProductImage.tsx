"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { cn } from "@/lib/utils";
import { normalizeCatalogImageSrc, catalogImageUrlAlternates } from "@/lib/normalize-image-url";
import { catalogProductImageClass } from "@/lib/product-image-classes";
import { productImageViewportWrapperClass } from "@/lib/flat-product-image";
import { productImageEmptyWellClass } from "@/lib/product-image-theme";

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
        onError={onError}
      />
    </div>
  );
}

function SlideVideo({ src, poster }: { src: string; poster?: string }) {
  return (
    <div className={cn("relative h-full w-full bg-slate-950", productImageViewportWrapperClass())}>
      <video
        src={src}
        poster={poster}
        className="h-full w-full object-contain"
        controls
        controlsList="nodownload"
        playsInline
        preload="metadata"
      />
    </div>
  );
}

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

type MediaSlide =
  | { kind: "image"; src: string; alt: string; key: string }
  | { kind: "video"; src: string; key: string; poster?: string };

type DualJewelleryProductImageProps = {
  primarySrc: string;
  secondary_image_url?: string | null;
  box_image_url?: string | null;
  video_url?: string | null;
  alt: string;
  sizes: string;
  subcategorySlug?: string | null;
  priority?: boolean;
  fetchPriority?: "high" | "low" | "auto";
  imageClassName?: string;
  unoptimized?: boolean;
  /** Fired when swipe/hover changes visible slide — use to sync box pricing. */
  onActiveIndexChange?: (index: number) => void;
  /** When set, parent can scroll gallery to this slide (e.g. "With box" chip). */
  scrollToIndex?: number | null;
};

export default function DualJewelleryProductImage({
  primarySrc,
  secondary_image_url,
  box_image_url,
  video_url,
  alt,
  sizes,
  subcategorySlug = null,
  priority = false,
  fetchPriority,
  imageClassName,
  unoptimized = true,
  onActiveIndexChange,
  scrollToIndex = null,
}: DualJewelleryProductImageProps) {
  const secondaryNorm =
    normalizeCatalogImageSrc(
      secondary_image_url == null ? undefined : String(secondary_image_url),
    ) || undefined;
  const boxNorm =
    normalizeCatalogImageSrc(box_image_url == null ? undefined : String(box_image_url)) ||
    undefined;
  const videoNorm = String(video_url ?? "").trim() || undefined;

  const primaryNorm = normalizeCatalogImageSrc(primarySrc) || primarySrc;
  const primaryAlternates = useMemo(
    () => catalogImageUrlAlternates(primaryNorm),
    [primaryNorm],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef({ x: 0, y: 0, moved: false, axis: null as "x" | "y" | null });
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);

  useEffect(() => {
    onActiveIndexChangeRef.current = onActiveIndexChange;
  }, [onActiveIndexChange]);

  const [primErr, setPrimErr] = useState(false);
  const [secErr, setSecErr] = useState(false);
  const [boxErr, setBoxErr] = useState(false);
  const [fallbackPrimUnopt, setFallbackPrimUnopt] = useState(false);
  const [fallbackSecUnopt, setFallbackSecUnopt] = useState(false);
  const [fallbackBoxUnopt, setFallbackBoxUnopt] = useState(false);
  const [primaryAltIdx, setPrimaryAltIdx] = useState(0);
  const [mobileIdx, setMobileIdx] = useState(0);
  const [hoverBack, setHoverBack] = useState(false);

  const resolvedPrimarySrc =
    primaryAltIdx === 0
      ? primaryNorm
      : primaryAlternates[primaryAltIdx - 1] ?? primaryNorm;

  const handlePrimaryError = useCallback(() => {
    if (!fallbackPrimUnopt) {
      setFallbackPrimUnopt(true);
      return;
    }
    if (primaryAltIdx < primaryAlternates.length) {
      setPrimaryAltIdx((i) => i + 1);
      setFallbackPrimUnopt(false);
      return;
    }
    setPrimErr(true);
  }, [fallbackPrimUnopt, primaryAltIdx, primaryAlternates.length]);

  const slides = useMemo((): MediaSlide[] => {
    const out: MediaSlide[] = [];
    if (primaryNorm && !primErr) {
      out.push({ kind: "image", src: resolvedPrimarySrc, alt, key: `p-${resolvedPrimarySrc}` });
    }
    if (secondaryNorm && !secErr) {
      out.push({
        kind: "image",
        src: secondaryNorm,
        alt: `${alt} — alternate view`,
        key: `s-${secondaryNorm}`,
      });
    }
    if (boxNorm && !boxErr) {
      out.push({
        kind: "image",
        src: boxNorm,
        alt: `${alt} — with gift box`,
        key: `b-${boxNorm}`,
      });
    }
    if (videoNorm) {
      out.push({
        kind: "video",
        src: videoNorm,
        key: `v-${videoNorm}`,
        poster: resolvedPrimarySrc,
      });
    }
    return out;
  }, [
    primaryNorm,
    primErr,
    resolvedPrimarySrc,
    alt,
    secondaryNorm,
    secErr,
    boxNorm,
    boxErr,
    videoNorm,
  ]);

  useEffect(() => {
    setPrimErr(false);
    setSecErr(false);
    setBoxErr(false);
    setFallbackPrimUnopt(false);
    setFallbackSecUnopt(false);
    setFallbackBoxUnopt(false);
    setPrimaryAltIdx(0);
    setMobileIdx(0);
    setHoverBack(false);
    scrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [primarySrc, secondaryNorm, boxNorm, videoNorm]);

  useEffect(() => {
    onActiveIndexChangeRef.current?.(mobileIdx);
  }, [mobileIdx]);

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    el.scrollTo({ left: scrollToIndex * w, behavior: "smooth" });
    setMobileIdx(scrollToIndex);
  }, [scrollToIndex]);

  const fetchP = fetchPriority ?? (priority ? "high" : undefined);
  const slideCount = slides.length;
  const dualDesktopHover = slideCount === 2 && slides[0]?.kind === "image" && slides[1]?.kind === "image";

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
    const t = e.touches[0];
    touchRef.current = {
      x: t?.clientX ?? 0,
      y: t?.clientY ?? 0,
      moved: false,
      axis: null,
    };
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (!touchRef.current.axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        touchRef.current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }
    if (touchRef.current.axis === "x" && Math.abs(dx) > 12) {
      touchRef.current.moved = true;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    window.setTimeout(() => {
      touchRef.current.moved = false;
      touchRef.current.axis = null;
    }, 80);
  }, []);

  if (!primaryNorm && !videoNorm) return null;

  if (primErr && slideCount === 0) {
    return (
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-2",
          productImageEmptyWellClass,
        )}
      >
        <span className="px-4 text-center text-xs text-slate-500">Photo unavailable</span>
      </div>
    );
  }

  if (slideCount <= 1 && slides[0]?.kind === "image") {
    return (
      <div className={productImageViewportWrapperClass()}>
        <Image
          key={`${slides[0].src}-${fallbackPrimUnopt ? "u" : "o"}-${primaryAltIdx}`}
          src={slides[0].src}
          alt={slides[0].alt}
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
          onError={handlePrimaryError}
        />
      </div>
    );
  }

  const renderImageSlide = (slide: Extract<MediaSlide, { kind: "image" }>, idx: number) => {
    const isPrimary = idx === 0;
    const isSecondary = idx === 1 && secondaryNorm && !secErr;
    const isBox = slide.key.startsWith("b-");
    return (
      <SlideImage
        src={slide.src}
        alt={slide.alt}
        sizes={sizes}
        subcategorySlug={subcategorySlug}
        imageClassName={imageClassName}
        unoptimized={
          unoptimized ||
          (isPrimary && fallbackPrimUnopt) ||
          (isSecondary && fallbackSecUnopt) ||
          (isBox && fallbackBoxUnopt)
        }
        priority={priority && idx === 0}
        fetchPriority={idx === 0 ? fetchP : "low"}
        hoverFx={dualDesktopHover}
        imageKey={slide.key}
        onError={() => {
          if (isPrimary) {
            handlePrimaryError();
            return;
          }
          if (isSecondary) {
            if (!fallbackSecUnopt) {
              setFallbackSecUnopt(true);
              return;
            }
            setSecErr(true);
            return;
          }
          if (isBox) {
            if (!fallbackBoxUnopt) {
              setFallbackBoxUnopt(true);
              return;
            }
            setBoxErr(true);
          }
        }}
      />
    );
  };

  return (
    <>
      <div
        ref={scrollRef}
        role="region"
        aria-label="Product photos — swipe sideways"
        className={cn(
          "absolute inset-0 z-[4] flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide kc-gallery-swipe",
          dualDesktopHover ? "md:hidden" : "",
        )}
        onScroll={syncIdxFromScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={blockLinkAfterSwipe}
      >
        {slides.map((slide, idx) => (
          <div
            key={slide.key}
            className="relative h-full min-w-full shrink-0 grow-0 basis-full snap-center snap-always"
          >
            {slide.kind === "video" ? (
              <SlideVideo src={slide.src} poster={slide.poster} />
            ) : (
              renderImageSlide(slide, idx)
            )}
          </div>
        ))}
      </div>

      {dualDesktopHover && slides[0]?.kind === "image" && slides[1]?.kind === "image" ? (
        <div
          className="absolute inset-0 z-[3] hidden md:block"
          onMouseEnter={() => {
            setHoverBack(true);
            onActiveIndexChangeRef.current?.(1);
          }}
          onMouseLeave={() => {
            setHoverBack(false);
            onActiveIndexChangeRef.current?.(0);
          }}
        >
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-300 ease-out",
              hoverBack ? "opacity-0" : "opacity-100",
            )}
          >
            {renderImageSlide(slides[0], 0)}
          </div>
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-300 ease-out",
              hoverBack ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            {renderImageSlide(slides[1], 1)}
          </div>
        </div>
      ) : null}

      <GalleryDots count={slideCount} active={mobileIdx} />
    </>
  );
}
