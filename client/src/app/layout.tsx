import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { CustomerTierProvider } from "@/context/CustomerTierContext";
import { ResellerBrandingProvider } from "@/context/ResellerBrandingContext";
import { KcThemeProvider } from "@/context/KcThemeContext";
import { CatalogPricingSettingsProvider } from "@/context/CatalogPricingSettingsContext";
import {
  getStorefrontTenantFromHeaders,
  type PublicResellerBranding,
} from "@/lib/reseller-branding-server";
import {
  fetchPublicKcAppThemeId,
  fetchSharedCatalogKcThemeId,
} from "@/lib/kc-theme-server";
import { isLightKcThemeId, normalizeKcThemeId } from "@/lib/kc-theme-ids";
import { publicRequestOrigin } from "@/lib/storefront-seo";
import { CartProvider } from "@/context/CartContext";
// Ensure axios sends cookies with cross-origin requests (must load before any API calls)
import "@/lib/axios";
import { BookRateProvider } from "@/context/BookRateContext";
import { LoginModalProvider } from "@/context/LoginModalContext";
import Navbar from "@/components/Navbar";
import BookRateModal from "@/components/BookRateModal";
import LoginModal from "@/components/LoginModal";
import CartDrawerWrapper from "@/components/CartDrawerWrapper";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import AuthToast from "@/components/AuthToast";
import AddToCartToast from "@/components/AddToCartToast";
import WhatsAppContactFab from "@/components/WhatsAppContactFab";
import PdfViewerOverlay from "@/components/shared/PdfViewerOverlay";
import ResellerAttentionSectionSync from "@/components/ResellerAttentionSectionSync";
import Footer from "@/components/Footer";
import { getOgImagePath } from "@/lib/og-image";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const site = process.env.NEXT_PUBLIC_SITE_URL || "https://kcjewellers.co.in";

const ogImage = getOgImagePath();

/** Preconnect to API host so TLS + first image bytes start earlier (catalog photos live under this origin). */
function apiOriginForPreconnect(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return null;
    return u.origin;
  } catch {
    return null;
  }
}

const kcMetadata: Metadata = {
  metadataBase: new URL(site),
  applicationName: "KC Jewellers",
  title: {
    default: "KC Jewellers — Gold, Silver & Diamond Jewellery",
    template: "%s · KC Jewellers",
  },
  description:
    "KC Jewellers — curated gold, silver, diamond and gifting jewellery with transparent today pricing incl. GST. Book rates, SIP plans, and shop the catalogue online.",
  keywords: [
    "KC Jewellers",
    "jewellery",
    "gold",
    "silver",
    "diamond",
    "catalogue",
    "India",
  ],
  authors: [{ name: "KC Jewellers" }],
  creator: "KC Jewellers",
  publisher: "KC Jewellers",
  formatDetection: {
    telephone: true,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: site,
    siteName: "KC Jewellers",
    title: "KC Jewellers — Gold, Silver & Diamond Jewellery",
    description:
      "Curated jewellery with today rates, SIP plans, and a full online catalogue.",
    images: [
      {
        url: ogImage,
        width: 2048,
        height: 2048,
        alt: "KC Jewellers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "KC Jewellers",
    description:
      "Gold, silver & diamond jewellery — today pricing and catalogue shopping.",
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: site.replace(/\/$/, ""),
  },
};

function storefrontOriginFromHeaders(h: Headers): string {
  return publicRequestOrigin(h);
}

function resellerHostMetadata(
  branding: PublicResellerBranding,
  origin: string,
): Metadata {
  const brand = branding.businessName?.trim() || "Partner store";
  const ogIcon = {
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon", type: "image/png" },
      ],
      apple: [{ url: "/apple-icon", type: "image/png" }],
      shortcut: [{ url: "/favicon.ico" }],
    },
  };

  return {
    metadataBase: new URL(origin),
    applicationName: brand,
    title: {
      default: `${brand} — Jewellery Catalogue`,
      template: `%s · ${brand}`,
    },
    description: `${brand} — curated jewellery with today's gold & silver rates and transparent pricing incl. GST.`,
    openGraph: {
      type: "website",
      locale: "en_IN",
      url: origin,
      siteName: brand,
      title: `${brand} — Jewellery Catalogue`,
      description:
        "Curated jewellery with today's rates — browse and shop online.",
      images: [
        { url: `${origin}/opengraph-image`, width: 1200, height: 1200, alt: brand },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: brand,
      description: "Curated jewellery with today's rates.",
      images: [`${origin}/opengraph-image`],
    },
    robots: { index: true, follow: true },
    alternates: { canonical: origin },
    ...ogIcon,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { branding, customDomainHost } = await getStorefrontTenantFromHeaders();
  if (!customDomainHost || !branding?.businessName) {
    return kcMetadata;
  }
  const h = await headers();
  return resellerHostMetadata(branding, storefrontOriginFromHeaders(h));
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const imageHost = apiOriginForPreconnect();
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  const { branding: resellerHostBranding, customDomainHost } =
    await getStorefrontTenantFromHeaders();

  let initialKcThemeId = await fetchPublicKcAppThemeId();
  if (resellerHostBranding?.kcThemeId) {
    initialKcThemeId = resellerHostBranding.kcThemeId;
  } else if (pathname.startsWith("/shared/")) {
    const uuid = pathname.slice("/shared/".length).split("/")[0]?.trim() || "";
    if (uuid) {
      initialKcThemeId = await fetchSharedCatalogKcThemeId(uuid);
    }
  }

  const resolvedKcThemeId = normalizeKcThemeId(initialKcThemeId);

  return (
    <html
      lang="en"
      data-kc-theme={resolvedKcThemeId}
      data-kc-luminosity={
        isLightKcThemeId(resolvedKcThemeId) ? "light" : "dark"
      }
      className="min-h-screen bg-slate-950"
    >
      <head>
        {imageHost ? (
          <>
            <link rel="preconnect" href={imageHost} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={imageHost} />
          </>
        ) : null}
        {customDomainHost ? (
          <>
            <link rel="icon" href="/favicon.ico" sizes="any" />
            <link rel="icon" href="/icon" type="image/png" sizes="32x32" />
            <link rel="apple-touch-icon" href="/apple-icon" sizes="180x180" />
            <link rel="image_src" href="/opengraph-image" />
          </>
        ) : null}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} font-sans antialiased bg-slate-950 text-slate-100 min-h-screen flex flex-col`}
      >
        <KcThemeProvider initialKcThemeId={resolvedKcThemeId}>
        <CatalogPricingSettingsProvider>
        <GoogleAnalytics />
        <CustomerTierProvider>
        <ResellerBrandingProvider
          initialFromHost={resellerHostBranding}
          customDomainHost={customDomainHost}
        >
        <CartProvider>
          <BookRateProvider>
            <LoginModalProvider>
            <Suspense fallback={null}>
              <Navbar />
            </Suspense>
            <ResellerAttentionSectionSync />
            <Suspense fallback={null}>
              <AuthToast />
            </Suspense>
            <AddToCartToast />
            <div className="flex flex-1 flex-col">{children}</div>
            <Footer />
            <Suspense fallback={null}>
              <BookRateModal />
            </Suspense>
            <LoginModal />
            <Suspense fallback={null}>
              <CartDrawerWrapper />
            </Suspense>
            <WhatsAppContactFab />
            <PdfViewerOverlay />
            </LoginModalProvider>
          </BookRateProvider>
        </CartProvider>
        </ResellerBrandingProvider>
        </CustomerTierProvider>
        </CatalogPricingSettingsProvider>
        </KcThemeProvider>
      </body>
    </html>
  );
}
