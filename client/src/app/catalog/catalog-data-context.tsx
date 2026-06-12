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
import {
  DEFAULT_CATALOG_RETAIL_BROWSE_BY_METAL,
  parseCatalogRetailBrowseByMetal,
  type CatalogRetailBrowseByMetal,
} from "@/lib/catalog-retail-tags";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerTier } from "@/context/CustomerTierContext";
import { CUSTOMER_TIER, type WholesaleUserFields } from "@/lib/customer-tier";
import { KC_RATES_UPDATED_EVENT } from "@/lib/reseller-rates-events";
import { catalogApiQueryForStorefront, ratesApiQueryForStorefront } from "@/lib/storefront-domain";
import { useResellerBranding } from "@/context/ResellerBrandingContext";
import { filterCatalogForResellerScope } from "@/lib/reseller-catalog-scope";

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

type CatalogDataContextValue = {
  categories: CatalogTreeCategory[];
  rates: unknown[];
  /** True only until the first catalogue + rates fetch completes (skipped when SSR snapshot exists). */
  isBootstrapping: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  /** Per-metal Shop for toggles (`app_settings.catalog_retail_browse_{gold|silver|diamond}`). Gift Items never uses Shop for. */
  retailBrowseByMetal: CatalogRetailBrowseByMetal;
  /** @deprecated true when any of gold/silver/diamond has Shop for enabled */
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
  const [retailBrowseByMetal, setRetailBrowseByMetal] = useState<CatalogRetailBrowseByMetal>(
    () => ({ ...DEFAULT_CATALOG_RETAIL_BROWSE_BY_METAL }),
  );
  const auth = useAuth();
  const { customerTier, tierReady } = useCustomerTier();
  const {
    customDomainHost,
    allowedCategoryIds: hostAllowedCategoryIds,
    allowedCategoryMetals: hostAllowedCategoryMetals,
  } = useResellerBranding();
  const applyRetailSettings = useCallback((data: { retail_browse_by_metal?: unknown; retail_browse_enabled?: boolean }) => {
    const byMetal = parseCatalogRetailBrowseByMetal(data?.retail_browse_by_metal);
    if (
      data?.retail_browse_by_metal == null &&
      data?.retail_browse_enabled != null
    ) {
      const on = !!data.retail_browse_enabled;
      setRetailBrowseByMetal({ gold: on, silver: on, diamond: on });
      return;
    }
    setRetailBrowseByMetal(byMetal);
  }, []);

  const retailBrowseEnabled =
    retailBrowseByMetal.gold || retailBrowseByMetal.silver || retailBrowseByMetal.diamond;
  const wholesaleUser = auth.user as WholesaleUserFields | undefined;

  const categories = useMemo(() => {
    if (!tierReady) return rawCategories;
    if (customerTier === CUSTOMER_TIER.RESELLER) {
      return filterCatalogForResellerScope(
        rawCategories,
        wholesaleUser?.allowed_category_ids ?? null,
        wholesaleUser?.allowed_category_metals,
      ) as CatalogTreeCategory[];
    }
    if (customDomainHost && hostAllowedCategoryIds?.length) {
      return filterCatalogForResellerScope(
        rawCategories,
        hostAllowedCategoryIds,
        hostAllowedCategoryMetals,
      ) as CatalogTreeCategory[];
    }
    return rawCategories;
  }, [
    tierReady,
    rawCategories,
    customerTier,
    wholesaleUser?.allowed_category_ids,
    wholesaleUser?.allowed_category_metals,
    customDomainHost,
    hostAllowedCategoryIds,
    hostAllowedCategoryMetals,
  ]);

  const bootstrap = useCallback(async () => {
    try {
      const catalogQ = catalogApiQueryForStorefront();
      const ratesQ = ratesApiQueryForStorefront();
      const [catalogRes, ratesRes, retailRes] = await Promise.all([
        axios.get(`${url}/api/catalog${catalogQ}`),
        axios.get(`${url}/api/rates/display${ratesQ}`),
        axios.get(`${url}/api/public/catalog-retail-settings`),
      ]);
      setRawCategories(catalogRes.data?.categories ?? []);
      setRates(ratesRes.data?.rates ?? []);
      applyRetailSettings(retailRes.data ?? {});
    } catch {
      setRawCategories([]);
      setRates([]);
      setRetailBrowseByMetal({ ...DEFAULT_CATALOG_RETAIL_BROWSE_BY_METAL });
    } finally {
      setIsBootstrapping(false);
    }
  }, [url, applyRetailSettings]);

  useEffect(() => {
    if (serverSeeded) {
      axios
        .get(`${url}/api/public/catalog-retail-settings`)
        .then((res) => applyRetailSettings(res.data ?? {}))
        .catch(() => setRetailBrowseByMetal({ ...DEFAULT_CATALOG_RETAIL_BROWSE_BY_METAL }));
    }
  }, [url, serverSeeded, applyRetailSettings]);

  useEffect(() => {
    if (serverSeeded) return;
    bootstrap();
  }, [bootstrap, serverSeeded]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const catalogQ = catalogApiQueryForStorefront();
      const ratesQ = ratesApiQueryForStorefront();
      const [catalogRes, ratesRes, retailRes] = await Promise.all([
        axios.get(`${url}/api/catalog${catalogQ}`),
        axios.get(`${url}/api/rates/display${ratesQ}`),
        axios.get(`${url}/api/public/catalog-retail-settings`),
      ]);
      setRawCategories(catalogRes.data?.categories ?? []);
      setRates(ratesRes.data?.rates ?? []);
      applyRetailSettings(retailRes.data ?? {});
    } finally {
      setIsRefreshing(false);
    }
  }, [url, applyRetailSettings]);

  useEffect(() => {
    const onRatesUpdated = () => {
      void refresh();
    };
    window.addEventListener(KC_RATES_UPDATED_EVENT, onRatesUpdated);
    return () => window.removeEventListener(KC_RATES_UPDATED_EVENT, onRatesUpdated);
  }, [refresh]);

  const value = useMemo(
    () => ({
      categories,
      rates,
      isBootstrapping,
      isRefreshing,
      refresh,
      retailBrowseByMetal,
      retailBrowseEnabled,
    }),
    [
      categories,
      rates,
      isBootstrapping,
      isRefreshing,
      refresh,
      retailBrowseByMetal,
      retailBrowseEnabled,
    ],
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
