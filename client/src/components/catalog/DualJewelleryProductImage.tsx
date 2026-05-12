"use client";

import Image from "next/image";
import { useEffect, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { normalizeCatalogImageSrc } from "@/lib/normalize-image-url";
import { catalogProductImageClass } from "@/lib/product-image-classes";
import { productImageViewportWrapperClass } from "@/lib/flat-product-image";

type DualJewelleryProductImageProps = {
  primarySrc: string;
  /** Raw DB / API field `secondary_image_url` (normalized inside). */
  secondary_image_url?: string | null;
  alt: string;
  sizes: string;
  subcategorySlug?: string | null;
  priority?: boolean;
  fetchPriority?: "high" | "low" | "auto";
  /** Passed through to primary + secondary `<Image />`. */
  imageClassName?: string;
  /** Shared brochure / known-remote hosts — bypass Next optimizer when needed. */
  unoptimized?: boolean;
};

/** Grid / brochure card: hover cross-fade on md+, dot toggle on smaller screens — only when secondary resolves. */
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

  const [primErr, setPrimErr] = useState(false);
  const [secErr, setSecErr] = useState(false);
  const [fallbackPrimUnopt, setFallbackPrimUnopt] = useState(false);
  const [fallbackSecUnopt, setFallbackSecUnopt] = useState(false);
  const [primLoaded, setPrimLoaded] = useState(false);
  const [secLoaded, setSecLoaded] = useState(false);
  /** Mobile / coarse pointer: which angle is visible (front = false). */
  const [showBackMobile, setShowBackMobile] = useState(false);

  useEffect(() => {
    setPrimErr(false);
    setSecErr(false);
    setFallbackPrimUnopt(false);
    setFallbackSecUnopt(false);
    setPrimLoaded(false);
    setSecLoaded(false);
    setShowBackMobile(false);
  }, [primarySrc, secondaryNorm]);

  const showDualUi = !!(secondaryNorm && !secErr);
  const fetchP = fetchPriority ?? (priority ? "high" : undefined);

  function onDotTap(e: MouseEvent<HTMLButtonElement>, back: boolean) {
    e.preventDefault();
    e.stopPropagation();
    setShowBackMobile(back);
  }

  if (!primarySrc) return null;

  if (primErr) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#0B1120]">
        <span className="text-5xl font-bold text-slate-600 select-none">{alt.charAt(0)}</span>
      </div>
    );
  }

  if (!showDualUi) {
    return (
      <>
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 bg-gradient-to-br from-slate-800/30 via-[#0B1120] to-slate-950",
            primLoaded ? "opacity-0" : "opacity-100",
            "transition-opacity duration-200",
            !primLoaded && "animate-pulse",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-[#0B1120]",
            primLoaded ? "opacity-0 pointer-events-none" : "opacity-100",
            "transition-opacity duration-150",
          )}
        >
          <span className="text-5xl font-bold text-slate-600/60 select-none">{alt.charAt(0)}</span>
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

  return (
    <>
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-slate-800/30 via-[#0B1120] to-slate-950",
          (showBackMobile ? secLoaded : primLoaded) ? "opacity-0" : "opacity-100",
          "transition-opacity duration-200",
          !(showBackMobile ? secLoaded : primLoaded) && "animate-pulse",
        )}
      />

      {/* Primary */}
      <div
        className={cn(
          productImageViewportWrapperClass(),
          "absolute inset-0 transition-opacity duration-300 ease-out md:transition-opacity",
          showBackMobile ? "opacity-0 md:opacity-0" : "opacity-100",
          "max-md:z-[1]",
          "md:z-[1] md:group-hover:opacity-0",
        )}
      >
        <Image
          key={`p-${primarySrc}-${fallbackPrimUnopt ? "u" : "o"}`}
          src={primarySrc}
          alt={alt}
          fill
          quality={72}
          sizes={sizes}
          className={cn(
            catalogProductImageClass(subcategorySlug),
            "transition-[filter,transform] duration-300 ease-out md:group-hover:brightness-105 md:group-hover:scale-[1.02]",
            imageClassName,
          )}
          unoptimized={unoptimized || fallbackPrimUnopt}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          priority={priority}
          fetchPriority={fetchP}
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

      {/* Secondary */}
      <div
        className={cn(
          productImageViewportWrapperClass(),
          "absolute inset-0 transition-opacity duration-300 ease-out",
          showBackMobile ? "opacity-100" : "opacity-0 pointer-events-none",
          "max-md:z-[2]",
          "md:z-[2] md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-none md:group-hover:opacity-100",
        )}
      >
        <Image
          key={`s-${secondaryNorm}-${fallbackSecUnopt ? "u" : "o"}`}
          src={secondaryNorm}
          alt={`${alt} — alternate view`}
          fill
          quality={72}
          sizes={sizes}
          className={cn(catalogProductImageClass(subcategorySlug), imageClassName)}
          unoptimized={unoptimized || fallbackSecUnopt}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "low" : fetchP}
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

      <div
        role="group"
        aria-label="Product photo angle"
        className="pointer-events-none absolute bottom-2 left-0 right-0 z-30 flex justify-center gap-2 px-2"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!showBackMobile}
          aria-label="Front view"
          onClick={(e) => onDotTap(e, false)}
          className={cn(
            "pointer-events-auto h-2.5 min-w-[2.5rem] rounded-full border transition md:opacity-90 md:hover:border-amber-400/70",
            !showBackMobile
              ? "border-amber-400/70 bg-amber-500 shadow-[0_0_16px_-2px_rgba(251,191,36,0.5)]"
              : "border-slate-500/70 bg-slate-950/80 backdrop-blur-sm",
          )}
        />
        <button
          type="button"
          role="radio"
          aria-checked={showBackMobile}
          aria-label="Alternate view"
          onClick={(e) => onDotTap(e, true)}
          className={cn(
            "pointer-events-auto h-2.5 min-w-[2.5rem] rounded-full border transition md:opacity-90 md:hover:border-amber-400/70",
            showBackMobile
              ? "border-amber-400/70 bg-amber-500 shadow-[0_0_16px_-2px_rgba(251,191,36,0.5)]"
              : "border-slate-500/70 bg-slate-950/80 backdrop-blur-sm",
          )}
        />
      </div>
    </>
  );
}
