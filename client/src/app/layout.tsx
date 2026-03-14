import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
// Ensure axios sends cookies with cross-origin requests (must load before any API calls)
import "@/lib/axios";
import { BookRateProvider } from "@/context/BookRateContext";
import Navbar from "@/components/Navbar";
import BookRateModal from "@/components/BookRateModal";
import CartDrawerWrapper from "@/components/CartDrawerWrapper";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import AuthToast from "@/components/AuthToast";
import AddToCartToast from "@/components/AddToCartToast";

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

export const metadata: Metadata = {
  title: "KC Jewellers",
  description: "Live gold rates and jewellery",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-slate-950">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100 min-h-screen`}
      >
        <GoogleAnalytics />
        <CartProvider>
          <BookRateProvider>
            <Suspense fallback={null}>
              <Navbar />
            </Suspense>
            <Suspense fallback={null}>
              <AuthToast />
            </Suspense>
            <AddToCartToast />
            {children}
            <BookRateModal />
            <Suspense fallback={null}>
              <CartDrawerWrapper />
            </Suspense>
          </BookRateProvider>
        </CartProvider>
      </body>
    </html>
  );
}
