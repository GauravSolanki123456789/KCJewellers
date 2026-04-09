import type { Metadata } from "next";
import SharedCatalogClient from "./shared-catalog-client";
import { getSiteUrl } from "@/lib/site";
import { getOgImagePath } from "@/lib/og-image";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  const site = getSiteUrl();
  const pageUrl = `${site}/shared/${encodeURIComponent(uuid)}`;
  const ogImage = getOgImagePath();

  return {
    metadataBase: new URL(site),
    title: "Shared catalogue",
    description:
      "KC Jewellers — curated jewellery selection with live pricing incl. GST.",
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "en_IN",
      url: pageUrl,
      siteName: "KC Jewellers",
      title: "KC Jewellers — Shared catalogue",
      description:
        "Curated jewellery selection — transparent live pricing incl. GST.",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 1200,
          alt: "KC Jewellers",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "KC Jewellers — Shared catalogue",
      description: "Curated jewellery selection — live pricing incl. GST.",
      images: [ogImage],
    },
  };
}

export default function SharedCatalogPage() {
  return <SharedCatalogClient />;
}
