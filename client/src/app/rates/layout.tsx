import type { Metadata } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL || "https://kcjewellers.co.in";

export const metadata: Metadata = {
  title: "Live Rates",
  description:
    "Today's live gold (24K, 22K, 18K) and silver rates at KC Jewellers — view prices and book your rate in one place.",
  alternates: { canonical: new URL("/rates", site).toString() },
};

export default function RatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
