"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CATALOG_PATH } from "@/lib/routes";
import { normalizeCatalogImageSrc } from "@/lib/normalize-image-url";
import type { PublicResellerBranding } from "@/lib/reseller-branding-server";
import {
  type StorefrontItem,
  type StorefrontSection,
  type StorefrontSite,
  normalizeStorefrontHref,
  youtubeEmbedId,
} from "@/lib/storefront-cms";

function mediaSrc(raw?: string | null): string {
  return normalizeCatalogImageSrc(raw || "") || "";
}

function TileImage({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const url = mediaSrc(src);
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-amber-50 via-[#f7f1e6] to-stone-100 ${className || ""}`}
      >
        <span className="px-4 text-center font-[family-name:var(--font-display)] text-lg text-[var(--color-jewelry-black,#1a1814)]/45 sm:text-xl">
          {alt}
        </span>
      </div>
    );
  }
  return (
    <span className={`relative block overflow-hidden ${className || ""}`}>
      <Image src={url} alt={alt} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" unoptimized />
    </span>
  );
}

function ItemCard({ item, tall }: { item: StorefrontItem; tall?: boolean }) {
  return (
    <Link
      href={normalizeStorefrontHref(item.href)}
      className="group block overflow-hidden rounded-sm bg-white text-[var(--color-jewelry-black,#1a1814)] shadow-sm ring-1 ring-stone-200/80"
    >
      <TileImage
        src={item.imageUrl}
        alt={item.label || "Jewellery"}
        className={tall ? "aspect-[4/5] w-full" : "aspect-[4/3] w-full"}
      />
      {(item.label || item.sublabel) && (
        <div className="px-3 py-3 text-center sm:px-4 sm:py-4">
          {item.label ? (
            <p className="font-[family-name:var(--font-display)] text-base tracking-wide sm:text-lg">
              {item.label}
            </p>
          ) : null}
          {item.sublabel ? (
            <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55 sm:text-sm">
              {item.sublabel}
            </p>
          ) : null}
        </div>
      )}
    </Link>
  );
}

function SectionHeading({ title, subtitle }: { title?: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  return (
    <div className="mx-auto mb-6 max-w-3xl px-4 text-center sm:mb-10">
      <div className="mb-2 flex items-center justify-center gap-3 text-amber-700/70">
        <span className="h-px w-8 bg-current sm:w-12" />
        <span aria-hidden className="text-[10px] tracking-[0.35em]">
          ◆
        </span>
        <span className="h-px w-8 bg-current sm:w-12" />
      </div>
      {title ? (
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-[0.12em] text-[var(--color-jewelry-black,#1a1814)] uppercase sm:text-3xl md:text-4xl">
          {title}
        </h2>
      ) : null}
      {subtitle ? (
        <p className="mt-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/60 sm:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function gridClass(columns?: number) {
  const c = columns === 2 ? 2 : columns === 4 ? 4 : 3;
  if (c === 2) return "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5";
  if (c === 4) return "grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5";
  return "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5";
}

function Hero({ site, brandName }: { site: StorefrontSite; brandName: string }) {
  const slides = site.hero.slides.filter(Boolean);
  const [idx, setIdx] = useState(0);
  const slide = slides[idx] || slides[0];
  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 7000);
    return () => window.clearInterval(t);
  }, [slides.length]);
  if (!site.hero.enabled || !slide) return null;
  const bg = mediaSrc(slide.imageUrl);
  const yt = youtubeEmbedId(slide.videoUrl || "");
  const align =
    slide.align === "center"
      ? "items-center text-center"
      : slide.align === "right"
        ? "items-end text-right"
        : "items-start text-left";
  return (
    <section className="relative min-h-[58vw] w-full overflow-hidden bg-[#1a1510] sm:min-h-[420px] md:min-h-[520px] lg:min-h-[600px]">
      {yt ? (
        <iframe
          title={slide.headline || brandName}
          src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&controls=0&loop=1&playlist=${yt}`}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media"
        />
      ) : slide.videoUrl && mediaSrc(slide.videoUrl) ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={mediaSrc(slide.videoUrl)}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : bg ? (
        <Image src={bg} alt={slide.headline || brandName} fill className="object-cover" priority unoptimized />
      ) : (
        <div className="absolute inset-0 bg-[url('/opengraph-image')] bg-cover bg-center opacity-40" />
      )}
      {slide.overlay !== false ? (
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
      ) : null}
      <div className={`relative z-10 flex min-h-[inherit] flex-col justify-center px-5 py-16 sm:px-12 md:px-16 ${align}`}>
        <p className="mb-3 font-[family-name:var(--font-display)] text-2xl text-white drop-shadow sm:text-4xl md:text-5xl lg:text-6xl">
          {slide.headline || brandName}
        </p>
        {slide.subhead ? (
          <p className="max-w-xl text-sm text-white/90 drop-shadow sm:text-lg">{slide.subhead}</p>
        ) : null}
        {slide.ctaText ? (
          <Link
            href={normalizeStorefrontHref(slide.ctaHref)}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] shadow-md transition hover:bg-amber-50"
          >
            {slide.ctaText}
          </Link>
        ) : null}
      </div>
      {slides.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            className="absolute left-2 top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--color-jewelry-black,#1a1814)] shadow sm:left-4"
            onClick={() => setIdx((i) => (i - 1 + slides.length) % slides.length)}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            className="absolute right-2 top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[var(--color-jewelry-black,#1a1814)] shadow sm:right-4"
            onClick={() => setIdx((i) => (i + 1) % slides.length)}
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      ) : null}
    </section>
  );
}

function SectionBlock({ section }: { section: StorefrontSection }) {
  if (!section.enabled) return null;
  if (section.type === "custom_html") {
    return (
      <section className="px-4 py-8 sm:px-6">
        {section.css ? <style dangerouslySetInnerHTML={{ __html: section.css }} /> : null}
        <div dangerouslySetInnerHTML={{ __html: section.html || section.body || "" }} />
      </section>
    );
  }
  if (section.type === "rich_text") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 text-center">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        {section.body ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/75 sm:text-base">
            {section.body}
          </p>
        ) : null}
      </section>
    );
  }
  if (section.type === "video") {
    const yt = youtubeEmbedId(section.videoUrl || "");
    const src = mediaSrc(section.videoUrl);
    return (
      <section className="px-4 py-10 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="mx-auto max-w-5xl overflow-hidden rounded-md bg-black shadow">
          {yt ? (
            <div className="aspect-video">
              <iframe
                title={section.title || "Video"}
                src={`https://www.youtube.com/embed/${yt}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; encrypted-media; gyroscope"
                allowFullScreen
              />
            </div>
          ) : src ? (
            <video className="aspect-video w-full" src={src} poster={mediaSrc(section.posterUrl)} controls playsInline />
          ) : (
            <div className="flex aspect-video items-center justify-center text-sm text-white/70">Add a video in Website editor</div>
          )}
        </div>
      </section>
    );
  }
  if (section.type === "cta") {
    return (
      <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-12 sm:grid-cols-2 sm:gap-10 sm:px-6">
        <TileImage src={section.imageUrl} alt={section.title || "Jewellery"} className="aspect-[4/5] w-full rounded-md" />
        <div className="text-[var(--color-jewelry-black,#1a1814)]">
          <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl">{section.title}</h2>
          {section.body ? <p className="mt-3 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/70 sm:text-base">{section.body}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            {section.ctaText ? (
              <Link
                href={normalizeStorefrontHref(section.ctaHref)}
                className="inline-flex min-h-11 items-center rounded-md bg-[var(--kc-accent,#9a1c2e)] px-5 text-sm font-semibold text-white"
              >
                {section.ctaText}
              </Link>
            ) : null}
            {section.secondaryText ? (
              <Link
                href={normalizeStorefrontHref(section.secondaryHref)}
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--kc-accent,#9a1c2e)] px-5 text-sm font-semibold text-[var(--kc-accent,#9a1c2e)]"
              >
                {section.secondaryText}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    );
  }
  if (section.type === "quality") {
    return (
      <section className="px-4 py-10 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        {section.imageUrl ? (
          <div className="mx-auto max-w-6xl overflow-hidden rounded-md">
            <TileImage src={section.imageUrl} alt={section.title || "Our store"} className="aspect-[21/9] w-full min-h-[180px]" />
          </div>
        ) : null}
      </section>
    );
  }

  const items = section.items || [];
  return (
    <section className="px-4 py-10 sm:px-6">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className={`mx-auto max-w-6xl ${gridClass(section.columns)}`}>
        {items.map((item) => (
          <ItemCard key={item.id} item={item} tall={section.type === "collections" || section.type === "shop_by_gender"} />
        ))}
      </div>
    </section>
  );
}

export default function StorefrontHomeView({
  site,
  branding,
  preview,
}: {
  site: StorefrontSite;
  branding: PublicResellerBranding | null;
  preview?: boolean;
}) {
  const brandName = branding?.businessName?.trim() || "Jewellery";
  const enabledSections = useMemo(
    () => (site.sections || []).filter((s) => s.enabled !== false),
    [site.sections],
  );

  useEffect(() => {
    if (preview) return;
    const js = site.customJs?.trim();
    if (!js) return;
    const el = document.createElement("script");
    el.type = "text/javascript";
    el.text = js;
    document.body.appendChild(el);
    return () => {
      el.remove();
    };
  }, [site.customJs, preview]);

  return (
    <div className="kc-storefront-home min-h-screen bg-[#faf7f2] text-[var(--color-jewelry-black,#1a1814)]">
      {site.customCss ? <style dangerouslySetInnerHTML={{ __html: site.customCss }} /> : null}
      {site.customHeadHtml && !preview ? (
        <div hidden dangerouslySetInnerHTML={{ __html: site.customHeadHtml }} />
      ) : null}

      {site.announcement?.enabled && site.announcement.text ? (
        <div className="bg-[var(--kc-accent,#9a1c2e)] px-3 py-2 text-center text-[11px] font-medium tracking-wide text-white sm:text-xs">
          {site.announcement.text}
        </div>
      ) : null}

      {site.navLinks?.length ? (
        <nav
          className="overflow-x-auto border-b border-stone-200 bg-white"
          aria-label="Store collections"
        >
          <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
            {site.navLinks.map((link) => (
              <Link
                key={link.id}
                href={normalizeStorefrontHref(link.href)}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-stone-100 hover:text-[var(--color-jewelry-black,#1a1814)]"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={CATALOG_PATH}
              className="ml-auto whitespace-nowrap rounded-full bg-[var(--kc-accent,#9a1c2e)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
            >
              Shop all
            </Link>
          </div>
        </nav>
      ) : null}

      <Hero site={site} brandName={brandName} />

      {enabledSections.map((section) => (
        <SectionBlock key={section.id} section={section} />
      ))}

      <div className="border-t border-stone-200 bg-white px-4 py-10 text-center">
        <p className="font-[family-name:var(--font-display)] text-xl text-[var(--color-jewelry-black,#1a1814)]">
          {brandName}
        </p>
        {site.footer?.tagline ? (
          <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">{site.footer.tagline}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
          {site.footer?.phone ? <a href={`tel:+91${site.footer.phone.replace(/\D/g, "").slice(-10)}`}>Call {site.footer.phone}</a> : null}
          {site.footer?.email ? <a href={`mailto:${site.footer.email}`}>{site.footer.email}</a> : null}
        </div>
        <Link
          href={CATALOG_PATH}
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-stone-300 px-5 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]"
        >
          Browse catalogue
        </Link>
      </div>
    </div>
  );
}
