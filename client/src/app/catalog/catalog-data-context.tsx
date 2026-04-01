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

type Category = {
  id: number;
  name: string;
  slug: string;
  image_url?: string;
  subcategories: {
    id: number;
    name: string;
    slug: string;
    products: unknown[];
  }[];
};

type CatalogDataContextValue = {
  categories: Category[];
  rates: unknown[];
  /** True only until the first catalogue + rates fetch completes. */
  isBootstrapping: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

const CatalogDataContext = createContext<CatalogDataContextValue | null>(null);

export default function CatalogDataProvider({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<unknown[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      const [catalogRes, ratesRes] = await Promise.all([
        axios.get(`${url}/api/catalog`),
        axios.get(`${url}/api/rates/display`),
      ]);
      setCategories(catalogRes.data?.categories ?? []);
      setRates(ratesRes.data?.rates ?? []);
    } catch {
      setCategories([]);
      setRates([]);
    } finally {
      setIsBootstrapping(false);
    }
  }, [url]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [catalogRes, ratesRes] = await Promise.all([
        axios.get(`${url}/api/catalog`),
        axios.get(`${url}/api/rates/display`),
      ]);
      setCategories(catalogRes.data?.categories ?? []);
      setRates(ratesRes.data?.rates ?? []);
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
    }),
    [categories, rates, isBootstrapping, isRefreshing, refresh]
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
