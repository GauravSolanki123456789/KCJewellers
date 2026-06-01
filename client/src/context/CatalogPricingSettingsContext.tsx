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
import type { CatalogPricingOptions } from "@/lib/pricing";

type CatalogPricingSettingsContextValue = {
  giftingGstEnabled: boolean;
  pricingOptions: CatalogPricingOptions;
  refresh: () => Promise<void>;
};

const CatalogPricingSettingsContext =
  createContext<CatalogPricingSettingsContextValue | null>(null);

export function CatalogPricingSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [giftingGstEnabled, setGiftingGstEnabled] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await axios.get(`${url}/api/public/catalog-pricing-settings`);
      const on = res.data?.gifting_gst_enabled;
      setGiftingGstEnabled(on !== false && on !== "false" && on !== 0);
    } catch {
      setGiftingGstEnabled(true);
    }
  }, [url]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      giftingGstEnabled,
      pricingOptions: { giftingGstEnabled } satisfies CatalogPricingOptions,
      refresh,
    }),
    [giftingGstEnabled, refresh],
  );

  return (
    <CatalogPricingSettingsContext.Provider value={value}>
      {children}
    </CatalogPricingSettingsContext.Provider>
  );
}

export function useCatalogPricingSettings(): CatalogPricingSettingsContextValue {
  const ctx = useContext(CatalogPricingSettingsContext);
  if (!ctx) {
    return {
      giftingGstEnabled: true,
      pricingOptions: { giftingGstEnabled: true },
      refresh: async () => {},
    };
  }
  return ctx;
}
