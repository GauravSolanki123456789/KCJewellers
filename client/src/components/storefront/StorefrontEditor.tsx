"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "@/lib/axios";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { PROFILE_PATH } from "@/lib/routes";
import { useResellerBranding } from "@/context/ResellerBrandingContext";
import StorefrontHomeView from "@/components/storefront/StorefrontHomeView";
import {
  SECTION_TYPE_LABELS,
  STOREFRONT_SECTION_TYPES,
  defaultStorefrontSite,
  emptyItem,
  emptySection,
  newStorefrontId,
  type StorefrontItem,
  type StorefrontSection,
  type StorefrontSectionType,
  type StorefrontSite,
  type StorefrontSlide,
} from "@/lib/storefront-cms";

type Tab = "hero" | "sections" | "code" | "preview";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/55">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "min-h-11 w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:ring-2 focus:ring-[var(--kc-accent,#9a1c2e)]/25";

function MediaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post("/api/reseller/storefront-media", fd, {
        withCredentials: true,
      });
      const url = String(res.data?.url || res.data?.absolute_url || "");
      if (url) onChange(url);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Upload failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Field label={label}>
        <input className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="https:// or /uploads/..." />
      </Field>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--color-slate-700,#e8e4df)] px-3 text-sm text-[var(--color-jewelry-black,#1a1814)]/80">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? "Uploading…" : "Upload image / video"}
        <input
          type="file"
          className="hidden"
          accept="image/*,video/mp4,video/webm"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      {err ? <p className="text-xs text-rose-600">{err}</p> : null}
    </div>
  );
}

function ItemEditor({
  item,
  onChange,
  onRemove,
}: {
  item: StorefrontItem;
  onChange: (next: StorefrontItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="kc-profile-card space-y-3 rounded-2xl p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Tile</p>
        <button type="button" onClick={onRemove} className="inline-flex min-h-10 items-center gap-1 text-xs text-rose-600">
          <Trash2 className="size-3.5" /> Remove
        </button>
      </div>
      <Field label="Label">
        <input className={inputCls} value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} />
      </Field>
      <Field label="Subtitle">
        <input className={inputCls} value={item.sublabel || ""} onChange={(e) => onChange({ ...item, sublabel: e.target.value })} />
      </Field>
      <Field label="Link">
        <input className={inputCls} value={item.href} onChange={(e) => onChange({ ...item, href: e.target.value })} />
      </Field>
      <MediaField label="Image" value={item.imageUrl} onChange={(imageUrl) => onChange({ ...item, imageUrl })} />
    </div>
  );
}

function SectionEditor({
  section,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  section: StorefrontSection;
  index: number;
  total: number;
  onChange: (next: StorefrontSection) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="kc-profile-card space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GripVertical className="size-4 text-[var(--color-jewelry-black,#1a1814)]/30" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          {SECTION_TYPE_LABELS[section.type]}
        </p>
        <label className="flex min-h-10 items-center gap-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">
          <input
            type="checkbox"
            checked={section.enabled}
            onChange={(e) => onChange({ ...section, enabled: e.target.checked })}
          />
          Visible
        </label>
        <button type="button" className="kc-icon-btn size-10" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
          <ArrowUp className="size-4" />
        </button>
        <button type="button" className="kc-icon-btn size-10" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
          <ArrowDown className="size-4" />
        </button>
        <button type="button" className="kc-icon-btn size-10 text-rose-600" onClick={onRemove} aria-label="Delete section">
          <Trash2 className="size-4" />
        </button>
      </div>
      <Field label="Title">
        <input className={inputCls} value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} />
      </Field>
      <Field label="Subtitle">
        <input className={inputCls} value={section.subtitle} onChange={(e) => onChange({ ...section, subtitle: e.target.value })} />
      </Field>
      {section.type === "rich_text" || section.type === "cta" || section.type === "quality" ? (
        <Field label="Text">
          <textarea
            className={`${inputCls} min-h-24 py-2`}
            value={section.body || ""}
            onChange={(e) => onChange({ ...section, body: e.target.value })}
          />
        </Field>
      ) : null}
      {section.type === "custom_html" ? (
        <>
          <Field label="HTML">
            <textarea
              className={`${inputCls} min-h-32 py-2 font-mono text-xs`}
              value={section.html || ""}
              onChange={(e) => onChange({ ...section, html: e.target.value })}
            />
          </Field>
          <Field label="CSS for this block">
            <textarea
              className={`${inputCls} min-h-24 py-2 font-mono text-xs`}
              value={section.css || ""}
              onChange={(e) => onChange({ ...section, css: e.target.value })}
            />
          </Field>
        </>
      ) : null}
      {section.type === "video" ? (
        <MediaField label="Video URL or upload" value={section.videoUrl} onChange={(videoUrl) => onChange({ ...section, videoUrl })} />
      ) : null}
      {section.type === "cta" || section.type === "quality" ? (
        <MediaField label="Image" value={section.imageUrl} onChange={(imageUrl) => onChange({ ...section, imageUrl })} />
      ) : null}
      {section.type === "cta" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button text">
            <input className={inputCls} value={section.ctaText || ""} onChange={(e) => onChange({ ...section, ctaText: e.target.value })} />
          </Field>
          <Field label="Button link">
            <input className={inputCls} value={section.ctaHref || ""} onChange={(e) => onChange({ ...section, ctaHref: e.target.value })} />
          </Field>
          <Field label="Second button">
            <input className={inputCls} value={section.secondaryText || ""} onChange={(e) => onChange({ ...section, secondaryText: e.target.value })} />
          </Field>
          <Field label="Second link">
            <input className={inputCls} value={section.secondaryHref || ""} onChange={(e) => onChange({ ...section, secondaryHref: e.target.value })} />
          </Field>
        </div>
      ) : null}
      {["shop_by_category", "banners", "collections", "shop_by_gender", "brands", "instagram"].includes(section.type) ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/55">
              Tiles
            </p>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-[var(--kc-accent,#9a1c2e)]"
              onClick={() => onChange({ ...section, items: [...section.items, emptyItem()] })}
            >
              <Plus className="size-3.5" /> Add tile
            </button>
          </div>
          {section.items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              onChange={(next) => {
                const items = section.items.slice();
                items[i] = next;
                onChange({ ...section, items });
              }}
              onRemove={() => onChange({ ...section, items: section.items.filter((x) => x.id !== item.id) })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function StorefrontEditor() {
  const branding = useResellerBranding();
  const [tab, setTab] = useState<Tab>("hero");
  const [site, setSite] = useState<StorefrontSite>(() => defaultStorefrontSite(branding.businessName));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [addType, setAddType] = useState<StorefrontSectionType>("banners");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get("/api/reseller/storefront-site", { withCredentials: true });
      if (res.data?.draft) setSite(res.data.draft as StorefrontSite);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Could not load website editor";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (publish = false) => {
    setError("");
    setOk("");
    if (publish) setPublishing(true);
    else setSaving(true);
    try {
      if (publish) {
        await axios.post("/api/reseller/storefront-site/publish", { draft: site }, { withCredentials: true });
        setOk("Published. Visitors on your domain now see this homepage.");
      } else {
        await axios.put("/api/reseller/storefront-site", { draft: site }, { withCredentials: true });
        setOk("Draft saved. Publish when you are ready.");
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Save failed";
      setError(msg);
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  const tabs = useMemo(
    () =>
      [
        { id: "hero" as const, label: "Hero & header" },
        { id: "sections" as const, label: "Sections" },
        { id: "code" as const, label: "Custom code" },
        { id: "preview" as const, label: "Preview" },
      ] as const,
    [],
  );

  const updateSlide = (i: number, next: StorefrontSlide) => {
    const slides = site.hero.slides.slice();
    slides[i] = next;
    setSite({ ...site, hero: { ...site.hero, slides } });
  };

  if (loading) {
    return (
      <div className="kc-profile-page flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading website editor…
      </div>
    );
  }

  return (
    <div className="kc-profile-page min-h-screen bg-[var(--color-slate-950,#faf7f2)] text-[var(--color-jewelry-black,#1a1814)]">
      <main className="mx-auto max-w-3xl px-4 py-5 kc-pb-mobile-nav md:max-w-4xl md:py-8">
        <Link
          href={PROFILE_PATH}
          className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/70"
        >
          <ArrowLeft className="size-4" /> Profile
        </Link>
        <header className="mb-5">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-jewelry-black,#1a1814)]">
            Your website
          </h1>
          <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
            Banners, videos, text, layout and custom HTML for {branding.businessName || "your storefront"}.
            Customers who open your domain stay on your site.
          </p>
        </header>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
                tab === t.id
                  ? "bg-[var(--kc-accent,#9a1c2e)] text-white"
                  : "bg-white text-[var(--color-jewelry-black,#1a1814)] ring-1 ring-[var(--color-slate-700,#e8e4df)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "hero" ? (
          <div className="space-y-4">
            <div className="kc-profile-card space-y-3 rounded-2xl p-4">
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={site.announcement.enabled}
                  onChange={(e) =>
                    setSite({ ...site, announcement: { ...site.announcement, enabled: e.target.checked } })
                  }
                />
                Show top announcement bar
              </label>
              <Field label="Announcement text">
                <input
                  className={inputCls}
                  value={site.announcement.text}
                  onChange={(e) => setSite({ ...site, announcement: { ...site.announcement, text: e.target.value } })}
                />
              </Field>
            </div>
            <div className="kc-profile-card space-y-3 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Hero banners</p>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-[var(--kc-accent,#9a1c2e)]"
                  onClick={() =>
                    setSite({
                      ...site,
                      hero: {
                        ...site.hero,
                        slides: [
                          ...site.hero.slides,
                          {
                            id: newStorefrontId("hero"),
                            headline: branding.businessName || "",
                            subhead: "",
                            ctaText: "Shop now",
                            ctaHref: "/catalog",
                            align: "left",
                            overlay: true,
                          },
                        ],
                      },
                    })
                  }
                >
                  <Plus className="size-3.5" /> Add slide
                </button>
              </div>
              {site.hero.slides.map((slide, i) => (
                <div key={slide.id} className="space-y-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] p-3">
                  <div className="flex justify-between">
                    <p className="text-xs font-semibold">Slide {i + 1}</p>
                    {site.hero.slides.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs text-rose-600"
                        onClick={() =>
                          setSite({
                            ...site,
                            hero: { ...site.hero, slides: site.hero.slides.filter((s) => s.id !== slide.id) },
                          })
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <Field label="Headline">
                    <input className={inputCls} value={slide.headline} onChange={(e) => updateSlide(i, { ...slide, headline: e.target.value })} />
                  </Field>
                  <Field label="Subheading">
                    <input className={inputCls} value={slide.subhead} onChange={(e) => updateSlide(i, { ...slide, subhead: e.target.value })} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Button text">
                      <input className={inputCls} value={slide.ctaText} onChange={(e) => updateSlide(i, { ...slide, ctaText: e.target.value })} />
                    </Field>
                    <Field label="Button link">
                      <input className={inputCls} value={slide.ctaHref} onChange={(e) => updateSlide(i, { ...slide, ctaHref: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Text alignment">
                    <select
                      className={inputCls}
                      value={slide.align}
                      onChange={(e) => updateSlide(i, { ...slide, align: e.target.value as StorefrontSlide["align"] })}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </Field>
                  <MediaField label="Banner image" value={slide.imageUrl} onChange={(imageUrl) => updateSlide(i, { ...slide, imageUrl })} />
                  <MediaField label="Banner video (optional)" value={slide.videoUrl} onChange={(videoUrl) => updateSlide(i, { ...slide, videoUrl })} />
                </div>
              ))}
            </div>
            <div className="kc-profile-card space-y-3 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Menu links under the header</p>
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-[var(--kc-accent,#9a1c2e)]"
                  onClick={() => setSite({ ...site, navLinks: [...site.navLinks, emptyItem({ label: "New link" })] })}
                >
                  <Plus className="size-3.5" /> Add link
                </button>
              </div>
              {site.navLinks.map((link, i) => (
                <div key={link.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input className={inputCls} value={link.label} onChange={(e) => {
                    const navLinks = site.navLinks.slice();
                    navLinks[i] = { ...link, label: e.target.value };
                    setSite({ ...site, navLinks });
                  }} placeholder="Label" />
                  <input className={inputCls} value={link.href} onChange={(e) => {
                    const navLinks = site.navLinks.slice();
                    navLinks[i] = { ...link, href: e.target.value };
                    setSite({ ...site, navLinks });
                  }} placeholder="/catalog" />
                  <button type="button" className="min-h-11 text-xs text-rose-600" onClick={() => setSite({ ...site, navLinks: site.navLinks.filter((x) => x.id !== link.id) })}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="kc-profile-card grid gap-3 rounded-2xl p-4 sm:grid-cols-2">
              <Field label="Footer tagline">
                <input className={inputCls} value={site.footer.tagline} onChange={(e) => setSite({ ...site, footer: { ...site.footer, tagline: e.target.value } })} />
              </Field>
              <Field label="Footer phone">
                <input className={inputCls} value={site.footer.phone} onChange={(e) => setSite({ ...site, footer: { ...site.footer, phone: e.target.value } })} />
              </Field>
              <Field label="Footer email">
                <input className={inputCls} value={site.footer.email} onChange={(e) => setSite({ ...site, footer: { ...site.footer, email: e.target.value } })} />
              </Field>
            </div>
          </div>
        ) : null}

        {tab === "sections" ? (
          <div className="space-y-4">
            <div className="kc-profile-card flex flex-wrap items-center gap-2 rounded-2xl p-3">
              <select className={`${inputCls} flex-1`} value={addType} onChange={(e) => setAddType(e.target.value as StorefrontSectionType)}>
                {STOREFRONT_SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SECTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="kc-btn-theme inline-flex min-h-11 items-center gap-1 px-4 text-sm font-semibold"
                onClick={() => setSite({ ...site, sections: [...site.sections, emptySection(addType)] })}
              >
                <Plus className="size-4" /> Add section
              </button>
            </div>
            {site.sections.map((section, i) => (
              <SectionEditor
                key={section.id}
                section={section}
                index={i}
                total={site.sections.length}
                onChange={(next) => {
                  const sections = site.sections.slice();
                  sections[i] = next;
                  setSite({ ...site, sections });
                }}
                onMove={(dir) => {
                  const j = i + dir;
                  if (j < 0 || j >= site.sections.length) return;
                  const sections = site.sections.slice();
                  const [moved] = sections.splice(i, 1);
                  sections.splice(j, 0, moved);
                  setSite({ ...site, sections });
                }}
                onRemove={() => setSite({ ...site, sections: site.sections.filter((s) => s.id !== section.id) })}
              />
            ))}
          </div>
        ) : null}

        {tab === "code" ? (
          <div className="space-y-4">
            <div className="kc-profile-card space-y-3 rounded-2xl p-4">
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
                Advanced: your CSS and JavaScript run only on your published homepage.
              </p>
              <Field label="Custom CSS">
                <textarea className={`${inputCls} min-h-40 py-2 font-mono text-xs`} value={site.customCss} onChange={(e) => setSite({ ...site, customCss: e.target.value })} />
              </Field>
              <Field label="Custom JavaScript">
                <textarea className={`${inputCls} min-h-40 py-2 font-mono text-xs`} value={site.customJs} onChange={(e) => setSite({ ...site, customJs: e.target.value })} />
              </Field>
              <Field label="Extra HTML">
                <textarea className={`${inputCls} min-h-32 py-2 font-mono text-xs`} value={site.customHeadHtml} onChange={(e) => setSite({ ...site, customHeadHtml: e.target.value })} />
              </Field>
            </div>
          </div>
        ) : null}

        {tab === "preview" ? (
          <div className="overflow-hidden rounded-2xl ring-1 ring-[var(--color-slate-700,#e8e4df)]">
            <div className="flex items-center justify-between bg-white px-3 py-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3.5" /> Live preview of your draft
              </span>
              <Link href="/" className="font-semibold text-[var(--kc-accent,#9a1c2e)]">
                Open homepage
              </Link>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <StorefrontHomeView
                site={site}
                branding={{
                  businessName: branding.businessName,
                  logoUrl: branding.logoUrl,
                  contactPhoneDigits: branding.contactPhoneDigits,
                  kcThemeId: "kci_royal_gold",
                  allowedCategoryIds: branding.allowedCategoryIds,
                  allowedCategoryMetals: branding.allowedCategoryMetals,
                  investEnabled: branding.investEnabled,
                  storefrontMarginPct: branding.storefrontMarginPct,
                  showMrpBehindBox: branding.showMrpBehindBox,
                  hidePrices: branding.hidePrices,
                  showLiveStock: branding.showLiveStock,
                }}
                preview
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        {ok ? <p className="mt-4 text-sm text-emerald-700">{ok}</p> : null}

        <div className="sticky bottom-[calc(var(--kc-mobile-nav-stack,4rem)+0.5rem)] z-20 mt-6 flex gap-2 md:bottom-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(false)}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] ring-1 ring-[var(--color-slate-700,#e8e4df)]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save draft
          </button>
          <button
            type="button"
            disabled={publishing}
            onClick={() => void save(true)}
            className="kc-btn-theme inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
          >
            {publishing ? <Loader2 className="size-4 animate-spin" /> : null}
            Publish
          </button>
        </div>
      </main>
    </div>
  );
}
