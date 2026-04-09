import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared catalogue",
  robots: { index: false, follow: false },
};

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
