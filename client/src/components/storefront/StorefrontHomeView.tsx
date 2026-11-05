"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CATALOG_PATH, CONTACT_PATH } from "@/lib/routes";
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
  priority,
}: {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const url = mediaSrc(src);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [showImg, setShowImg] = useState(!!priority);

  useEffect(() => {
    if (priority || !url) return;
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShowImg(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShowImg(true);
          io.disconnect();
        }
      },
      { rootMargin: "320px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [priority, url]);

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
    <span ref={wrapRef} className={`relative block overflow-hidden ${className || ""}`}>
      {showImg ? (
        <Image
          src={url}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 33vw"
          unoptimized
          loading={priority ? "eager" : "lazy"}
          priority={priority}
          decoding="async"
        />
      ) : (
        <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-amber-50 via-[#f7f1e6] to-stone-100" aria-hidden />
      )}
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const autoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (slides.length < 2) return;
    autoTimerRef.current = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el || el.clientWidth <= 0) return;
      const w = el.clientWidth;
      const current = Math.round(el.scrollLeft / w);
      const next = (current + 1) % slides.length;
      el.scrollTo({ left: next * w, behavior: "smooth" });
    }, 7000);
    return () => {
      if (autoTimerRef.current != null) window.clearInterval(autoTimerRef.current);
    };
  }, [slides.length]);

  const syncIndexFromScroll = () => {
    const el = scrollerRef.current;
    if (!el || slides.length < 2) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    setIdx(Math.min(slides.length - 1, Math.max(0, i)));
  };

  const goTo = (next: number) => {
    const el = scrollerRef.current;
    if (!el || slides.length < 2) return;
    const i = ((next % slides.length) + slides.length) % slides.length;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIdx(i);
  };

  if (!site.hero.enabled || !slides.length) return null;

  const renderSlide = (slide: (typeof slides)[0], slideKey: string) => {
    const bg = mediaSrc(slide.imageUrl);
    const yt = youtubeEmbedId(slide.videoUrl || "");
    const align =
      slide.align === "center"
        ? "items-center text-center"
        : slide.align === "right"
          ? "items-end text-right"
          : "items-start text-left";
    return (
      <div
        key={slideKey}
        className="relative min-h-[58vw] w-full shrink-0 snap-start snap-always bg-[#faf7f2] sm:min-h-[420px] md:min-h-0 md:aspect-[21/9] lg:aspect-[2.4/1]"
      >
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
          <Image
            src={bg}
            alt={slide.headline || brandName}
            fill
            className="object-cover object-center"
            priority
            unoptimized
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-[#f7f1e6] to-stone-100 opacity-90" />
        )}
        {slide.overlay !== false ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent" />
        ) : null}
        <div
          className={`relative z-10 flex min-h-[inherit] flex-col justify-center px-5 py-16 sm:px-12 md:px-16 ${align}`}
        >
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
      </div>
    );
  };

  const slideTrack =
    slides.length > 1 ? (
      <div
        ref={scrollerRef}
        className="flex w-full cursor-grab overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={syncIndexFromScroll}
        aria-label="Hero banners — swipe or drag to browse"
      >
        {slides.map((s, i) => renderSlide(s, s.id || String(i)))}
      </div>
    ) : (
      renderSlide(slides[0], slides[0].id || "0")
    );

  return (
    <section className="relative w-full bg-[#faf7f2]">
      {slideTrack}
      {slides.length > 1 ? (
        <div
          className="pointer-events-none absolute bottom-4 left-0 right-0 z-20 flex items-center justify-center gap-2 sm:bottom-6"
          role="tablist"
          aria-label="Hero banners"
        >
          {slides.map((s, i) => (
            <button
              key={s.id || i}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={`Banner ${i + 1} of ${slides.length}`}
              onClick={() => goTo(i)}
              className={`pointer-events-auto h-2.5 rounded-full transition-all ${
                i === idx ? "w-7 bg-[var(--kc-accent,#9a1c2e)]" : "w-2.5 bg-[var(--color-jewelry-black,#1a1814)]/25 hover:bg-[var(--color-jewelry-black,#1a1814)]/40"
              }`}
            />
          ))}
        </div>
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
                className="kc-storefront-accent-pill inline-flex min-h-11 items-center rounded-md bg-[var(--kc-accent,#9a1c2e)] px-5 text-sm font-semibold text-white shadow-sm"
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
            {normalizeStorefrontHref(section.secondaryHref) !== CONTACT_PATH ? (
              <Link
                href={CONTACT_PATH}
                className="inline-flex min-h-11 items-center rounded-md border border-stone-300 bg-white px-5 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]"
              >
                Contact us
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
  const shopAllLabel = (site.shopAllLabel || "Shop all").trim() || "Shop all";
  const shopAllHref = normalizeStorefrontHref(site.shopAllHref || CATALOG_PATH);
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
              href={shopAllHref}
              className="kc-storefront-accent-pill ml-auto whitespace-nowrap rounded-full bg-[var(--kc-accent,#9a1c2e)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-sm"
            >
              {shopAllLabel}
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
          <Link href={CONTACT_PATH} className="font-medium text-[var(--kc-accent,#9a1c2e)] hover:underline">
            Contact us
          </Link>
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
