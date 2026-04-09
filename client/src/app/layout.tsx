import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
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

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const site = process.env.NEXT_PUBLIC_SITE_URL || "https://kcjewellers.co.in";

const ogImage = getOgImagePath();

export const metadata: Metadata = {
  metadataBase: new URL(site),
  applicationName: "KC Jewellers",
  title: {
    default: "KC Jewellers — Gold, Silver & Diamond Jewellery",
    template: "%s · KC Jewellers",
  },
  description:
    "KC Jewellers — curated gold, silver, and diamond jewellery with transparent live pricing incl. GST. Book rates, SIP plans, and shop the catalogue online.",
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
      "Curated jewellery with live rates, SIP plans, and a full online catalogue.",
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
      "Gold, silver & diamond jewellery — live pricing and catalogue shopping.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-slate-950">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100 min-h-screen flex flex-col`}
      >
        <GoogleAnalytics />
        <CartProvider>
          <BookRateProvider>
            <LoginModalProvider>
            <Suspense fallback={null}>
              <Navbar />
            </Suspense>
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
            </LoginModalProvider>
          </BookRateProvider>
        </CartProvider>
      </body>
    </html>
  );
}
