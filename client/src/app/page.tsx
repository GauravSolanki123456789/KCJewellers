import { permanentRedirect } from "next/navigation";
import { CATALOG_PATH } from "@/lib/routes";

/** Storefront entry: visitors land on the product catalogue first. */
export default function RootPage() {
  permanentRedirect(CATALOG_PATH);
}
