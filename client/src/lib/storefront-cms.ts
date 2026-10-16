import { CATALOG_PATH, RATES_PATH } from "@/lib/routes";

export const STOREFRONT_SECTION_TYPES = [
  "shop_by_category",
  "banners",
  "collections",
  "video",
  "rich_text",
  "custom_html",
  "shop_by_gender",
  "cta",
  "brands",
  "instagram",
  "quality",
] as const;

export type StorefrontSectionType = (typeof STOREFRONT_SECTION_TYPES)[number];
export type StorefrontAlign = "left" | "center" | "right";

export type StorefrontItem = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  imageUrl?: string;
  videoUrl?: string;
  align?: StorefrontAlign;
};

export type StorefrontSlide = {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  headline: string;
  subhead: string;
  ctaText: string;
  ctaHref: string;
  align: StorefrontAlign;
  overlay?: boolean;
};

export type StorefrontSection = {
  id: string;
  type: StorefrontSectionType;
  enabled: boolean;
  title: string;
  subtitle: string;
  body?: string;
  html?: string;
  css?: string;
  videoUrl?: string;
  posterUrl?: string;
  imageUrl?: string;
  href?: string;
  ctaText?: string;
  ctaHref?: string;
  secondaryText?: string;
  secondaryHref?: string;
  align?: StorefrontAlign;
  columns?: number;
  items: StorefrontItem[];
};

export type StorefrontSite = {
  announcement: { enabled: boolean; text: string };
  hero: { enabled: boolean; slides: StorefrontSlide[] };
  navLinks: StorefrontItem[];
  sections: StorefrontSection[];
  footer: { tagline: string; phone: string; email: string };
  customCss: string;
  customJs: string;
  customHeadHtml: string;
};

export const SECTION_TYPE_LABELS: Record<StorefrontSectionType, string> = {
  shop_by_category: "Shop by category",
  banners: "Banner grid",
  collections: "Collections carousel",
  video: "Video",
  rich_text: "Text block",
  custom_html: "Custom HTML / CSS",
  shop_by_gender: "Shop by gender",
  cta: "Call to action",
  brands: "Brand logos",
  instagram: "Photo gallery",
  quality: "Quality / story",
};

export function newStorefrontId(prefix = "s"): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyItem(partial?: Partial<StorefrontItem>): StorefrontItem {
  return {
    id: newStorefrontId("i"),
    label: "",
    sublabel: "",
    href: CATALOG_PATH,
    imageUrl: "",
    ...partial,
  };
}

export function emptySection(type: StorefrontSectionType): StorefrontSection {
  const base: StorefrontSection = {
    id: newStorefrontId("sec"),
    type,
    enabled: true,
    title: SECTION_TYPE_LABELS[type],
    subtitle: "",
    body: "",
    html: "",
    css: "",
    videoUrl: "",
    imageUrl: "",
    ctaText: "Shop now",
    ctaHref: CATALOG_PATH,
    align: "center",
    columns: 3,
    items: [],
  };
  if (type === "shop_by_category") {
    base.items = [
      emptyItem({ label: "Gold jewellery", href: `${CATALOG_PATH}/gold` }),
      emptyItem({ label: "Silver jewellery", href: `${CATALOG_PATH}/silver` }),
      emptyItem({ label: "Diamond jewellery", href: `${CATALOG_PATH}/diamond` }),
    ];
  }
  if (type === "shop_by_gender") {
    base.items = [
      emptyItem({ label: "Women", href: `${CATALOG_PATH}?shop_for=women` }),
      emptyItem({ label: "Men", href: `${CATALOG_PATH}?shop_for=men` }),
      emptyItem({ label: "Kids", href: `${CATALOG_PATH}?shop_for=kids` }),
    ];
  }
  if (type === "banners" || type === "collections" || type === "brands" || type === "instagram") {
    base.items = [emptyItem({ label: "Featured" }), emptyItem({ label: "New" })];
  }
  if (type === "video") {
    base.subtitle = "Paste a YouTube link or upload a video";
  }
  return base;
}

export function defaultStorefrontSite(brandName: string): StorefrontSite {
  const name = brandName.trim() || "Our Jewellery";
  return {
    announcement: {
      enabled: true,
      text: `Welcome to ${name}. Explore gold, silver & diamond jewellery.`,
    },
    hero: {
      enabled: true,
      slides: [
        {
          id: newStorefrontId("hero"),
          imageUrl: "",
          videoUrl: "",
          headline: name,
          subhead: "Crafted for those who wear their brilliance with pride",
          ctaText: "Shop now",
          ctaHref: CATALOG_PATH,
          align: "left",
          overlay: true,
        },
      ],
    },
    navLinks: [
      emptyItem({ label: "New arrivals", href: CATALOG_PATH }),
      emptyItem({ label: "Gold", href: `${CATALOG_PATH}/gold` }),
      emptyItem({ label: "Silver", href: `${CATALOG_PATH}/silver` }),
      emptyItem({ label: "Diamond", href: `${CATALOG_PATH}/diamond` }),
      emptyItem({ label: "Today's gold rate", href: RATES_PATH }),
    ],
    sections: [
      emptySection("shop_by_category"),
      emptySection("banners"),
      emptySection("shop_by_gender"),
      emptySection("cta"),
      emptySection("quality"),
    ],
    footer: { tagline: "Every piece tells a story of joy", phone: "", email: "" },
    customCss: "",
    customJs: "",
    customHeadHtml: "",
  };
}

/** Ensure menu / CTA hrefs work from homepage (relative paths, trim). */
export function normalizeStorefrontHref(href: string | undefined | null): string {
  const raw = String(href || "").trim();
  if (!raw) return CATALOG_PATH;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return raw;
  }
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("?")) return `${CATALOG_PATH}${raw}`;
  return `/${raw.replace(/^\//, "")}`;
}

export function youtubeEmbedId(url: string): string | null {
  const t = String(url || "").trim();
  if (!t) return null;
  const m = t.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  );
  return m?.[1] || null;
}
