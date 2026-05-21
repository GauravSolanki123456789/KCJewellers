"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import axios from "@/lib/axios";
import type { Item } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerTier } from "@/context/CustomerTierContext";
import { CUSTOMER_TIER, type WholesaleUserFields } from "@/lib/customer-tier";

export type CatalogTreeCategory = {
  id: number;
  name: string;
  slug: string;
  image_url?: string;
  subcategories: {
    id: number;
    name: string;
    slug: string;
    /** Admin-ordered list of `design_group` keys (ERP itemCode); merged with live product groups on the storefront. */
    design_group_order?: string[] | null;
    /** Retail tag — `web_subcategories.audience` (women, men, kids, unisex) */
    audience?: string | null;
    /** Retail tag — `web_subcategories.product_type` */
    product_type?: string | null;
    products: Item[];
  }[];
};

function filterCategoriesForReseller(
  cats: CatalogTreeCategory[],
  allowedIds: number[] | null | undefined,
): CatalogTreeCategory[] {
  if (allowedIds === null || allowedIds === undefined || allowedIds.length === 0) return cats;
  const set = new Set(allowedIds);
  return cats.filter((c) => set.has(c.id));
}

type CatalogDataContextValue = {
  categories: CatalogTreeCategory[];
  rates: unknown[];
  /** True only until the first catalogue + rates fetch completes (skipped when SSR snapshot exists). */
  isBootstrapping: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  /** Admin toggle — Shop for UI on storefront (`app_settings.catalog_retail_browse_enabled`). */
  retailBrowseEnabled: boolean;
};

const CatalogDataContext = createContext<CatalogDataContextValue | null>(null);

export function CatalogDataProvider({
  children,
  /** Snapshot from GET /api/catalog + /api/rates/display — SSR HTML matches what crawlers index. */
  initialCategories,
  initialRates,
}: {
  children: ReactNode;
  initialCategories?: CatalogTreeCategory[];
  initialRates?: unknown[];
}) {
  const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const serverSeeded = initialCategories !== undefined;
  const [rawCategories, setRawCategories] = useState<CatalogTreeCategory[]>(
    () => initialCategories ?? [],
  );
  const [rates, setRates] = useState<unknown[]>(() =>
    Array.isArray(initialRates) ? initialRates : [],
  );
  const [isBootstrapping, setIsBootstrapping] = useState(!serverSeeded);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retailBrowseEnabled, setRetailBrowseEnabled] = useState(false);
  const auth = useAuth();
  const { customerTier, tierReady } = useCustomerTier();
  const wholesaleUser = auth.user as WholesaleUserFields | undefined;

  const categories = useMemo(() => {
    if (!tierReady) return rawCategories;
    if (customerTier !== CUSTOMER_TIER.RESELLER) return rawCategories;
    return filterCategoriesForReseller(rawCategories, wholesaleUser?.allowed_category_ids ?? null);
  }, [tierReady, rawCategories, customerTier, wholesaleUser?.allowed_category_ids]);

  const bootstrap = useCallback(async () => {
    try {
      const [catalogRes, ratesRes, retailRes] = await Promise.all([
        axios.get(`${url}/api/catalog`),
        axios.get(`${url}/api/rates/display`),
        axios.get(`${url}/api/public/catalog-retail-settings`),
      ]);
      setRawCategories(catalogRes.data?.categories ?? []);
      setRates(ratesRes.data?.rates ?? []);
      setRetailBrowseEnabled(!!retailRes.data?.retail_browse_enabled);
    } catch {
      setRawCategories([]);
      setRates([]);
      setRetailBrowseEnabled(false);
    } finally {
      setIsBootstrapping(false);
    }
  }, [url]);

  useEffect(() => {
    if (serverSeeded) {
      axios
        .get(`${url}/api/public/catalog-retail-settings`)
        .then((res) => setRetailBrowseEnabled(!!res.data?.retail_browse_enabled))
        .catch(() => setRetailBrowseEnabled(false));
    }
  }, [url, serverSeeded]);

  useEffect(() => {
    if (serverSeeded) return;
    bootstrap();
  }, [bootstrap, serverSeeded]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [catalogRes, ratesRes, retailRes] = await Promise.all([
        axios.get(`${url}/api/catalog`),
        axios.get(`${url}/api/rates/display`),
        axios.get(`${url}/api/public/catalog-retail-settings`),
      ]);
      setRawCategories(catalogRes.data?.categories ?? []);
      setRates(ratesRes.data?.rates ?? []);
      setRetailBrowseEnabled(!!retailRes.data?.retail_browse_enabled);
    } finally {
      setIsRefreshing(false);
    }
  }, [url]);

  const value = useMemo(
    () => ({
      categories,
      rates,
      isBootstrapping,
      isRefreshing,
      refresh,
      retailBrowseEnabled,
    }),
    [categories, rates, isBootstrapping, isRefreshing, refresh, retailBrowseEnabled]
  );

  return (
    <CatalogDataContext.Provider value={value}>
      {children}
    </CatalogDataContext.Provider>
  );
}

export function useCatalogData(): CatalogDataContextValue {
  const ctx = useContext(CatalogDataContext);
  if (!ctx) {
    throw new Error("useCatalogData must be used within CatalogDataProvider");
  }
  return ctx;
}
