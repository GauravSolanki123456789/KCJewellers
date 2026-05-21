"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, LayoutGrid, Package, Search, Sparkles } from "lucide-react";
import {
  normalizeSearchQuery,
  resolveSearchSynonym,
  shouldSkipSearchSynonym,
} from "@/lib/searchSynonyms";
import { SEARCH_PATH } from "@/lib/routes";
import {
  buildCatalogShopHref,
  catalogAudienceLabel,
  catalogProductTypeLabel,
  CATALOG_DISCOVERY_CHIPS,
} from "@/lib/catalog-retail-tags";
import axios from "@/lib/axios";
import {
  buildFuseForSearchRecords,
  flattenCatalogToBrowseRecords,
  flattenCatalogToSearchRecords,
  getCatalogForSearchIndex,
  rankBrowseRecords,
  rankSearchRecords,
  type SearchBrowseRecord,
  type SearchIndexRecord,
} from "@/lib/search-catalog-cache";

const DEBOUNCE_MS = 300;
const FUSE_LIMIT = 8;
const BROWSE_LIMIT = 6;

function pathsMatch(a: string, b: string): boolean {
  const x = (a || "").replace(/\/$/, "") || "/";
  const y = (b || "").replace(/\/$/, "") || "/";
  return x === y;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function browseHint(row: SearchBrowseRecord): string {
  const parts: string[] = [row.styleName];
  if (row.audience) parts.push(catalogAudienceLabel(row.audience));
  if (row.productType) parts.push(catalogProductTypeLabel(row.productType));
  parts.push(`${row.productCount} items`);
  return parts.join(" · ");
}

function inferMetalFromPathname(pathname: string): "gold" | "silver" | "diamond" {
  const parts = pathname.replace(/\/$/, "").split("/");
  const idx = parts.indexOf("catalog");
  const m = idx >= 0 ? parts[idx + 1]?.toLowerCase() : "";
  if (m === "gold" || m === "silver" || m === "diamond") return m;
  return "silver";
}

type SmartSearchProps = {
  compact?: boolean;
  className?: string;
};

export default function SmartSearch({
  compact = false,
  className = "",
}: SmartSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const debounced = useDebouncedValue(raw, DEBOUNCE_MS);
  const [records, setRecords] = useState<SearchIndexRecord[]>([]);
  const [browseRecords, setBrowseRecords] = useState<SearchBrowseRecord[]>([]);
  const [retailBrowseEnabled, setRetailBrowseEnabled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getCatalogForSearchIndex().then((cats) => {
      if (cancelled) return;
      setRecords(flattenCatalogToSearchRecords(cats));
      setBrowseRecords(flattenCatalogToBrowseRecords(cats));
    });
    axios
      .get("/api/public/catalog-retail-settings")
      .then((res) => {
        if (!cancelled) setRetailBrowseEnabled(!!res.data?.retail_browse_enabled);
      })
      .catch(() => {
        if (!cancelled) setRetailBrowseEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fuse = useMemo(() => {
    if (!records.length) return null;
    return buildFuseForSearchRecords(records);
  }, [records]);

  const normalized = useMemo(
    () => normalizeSearchQuery(debounced),
    [debounced]
  );

  const synonymMatch = useMemo(() => {
    if (!normalized || normalized.length < 2) return null;
    return resolveSearchSynonym(debounced);
  }, [debounced, normalized]);

  const fuseHits = useMemo(() => {
    if (!fuse || !normalized || normalized.length < 2) return [];
    const rawHits = fuse.search(debounced, { limit: FUSE_LIMIT * 2 }).map((r) => r.item);
    return rankSearchRecords(rawHits, debounced, FUSE_LIMIT);
  }, [fuse, debounced, normalized]);

  const browseHits = useMemo(() => {
    if (!normalized || normalized.length < 2 || browseRecords.length === 0) return [];
    return rankBrowseRecords(browseRecords, debounced, BROWSE_LIMIT);
  }, [browseRecords, debounced, normalized]);

  const showDiscovery = open && normalized.length < 2 && retailBrowseEnabled;
  const showResults =
    open &&
    normalized.length >= 2 &&
    !!(synonymMatch || fuseHits.length > 0 || browseHits.length > 0);
  const showPanel = showDiscovery || showResults;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const navigateSearch = useCallback(
    (q: string) => {
      const t = q.trim();
      if (!t) return;
      const n = normalizeSearchQuery(t);
      if (!shouldSkipSearchSynonym(n)) {
        const syn = resolveSearchSynonym(t);
        if (syn) {
          if (pathsMatch(pathname, syn.href)) {
            setOpen(false);
            setRaw("");
            inputRef.current?.blur();
            return;
          }
          startTransition(() => {
            router.replace(syn.href, { scroll: false });
          });
          setOpen(false);
          setRaw("");
          inputRef.current?.blur();
          return;
        }
      }
      startTransition(() => {
        router.push(`${SEARCH_PATH}?q=${encodeURIComponent(t)}`);
      });
      setOpen(false);
      setRaw("");
      inputRef.current?.blur();
    },
    [pathname, router, startTransition]
  );

  const goCatalogHref = useCallback(
    (href: string) => {
      if (pathsMatch(pathname, href)) {
        setOpen(false);
        setRaw("");
        inputRef.current?.blur();
        return;
      }
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
      setOpen(false);
      setRaw("");
      inputRef.current?.blur();
    },
    [pathname, router, startTransition]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateSearch(raw);
  };

  const inputCls = compact
    ? "h-9 pl-9 pr-2.5 text-[13px] leading-none"
    : "h-10 pl-10 pr-3 text-sm leading-normal md:text-[15px]";

  const placeholder = "Search jewellery, SKU, or barcode";

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <form onSubmit={onSubmit} className="relative" noValidate>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={raw}
          disabled={isPending}
          onChange={(e) => {
            setRaw(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className={`w-full rounded-xl border border-slate-300/25 bg-slate-900/90 text-slate-100 shadow-inner outline-none ring-amber-500/0 transition-[box-shadow,border-color,opacity] placeholder:text-slate-500 focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/25 disabled:opacity-60 ${inputCls}`}
          aria-label="Search catalogue"
          aria-expanded={showPanel}
          aria-controls="smart-search-results"
          aria-busy={isPending}
        />
      </form>

      {showPanel ? (
        <div
          id="smart-search-results"
          role="listbox"
          className="kc-smart-search-panel absolute left-0 right-0 top-[calc(100%+8px)] z-[70] max-h-[min(70vh,22rem)] w-full min-w-[12rem] overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-300/25 bg-slate-950/98 py-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur-xl kc-scroll-contain"
        >
          {showDiscovery ? (
            <div className="px-2 pb-1">
              <p className="flex items-center gap-1.5 px-1 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                <Sparkles className="size-3 text-amber-500/80" aria-hidden />
                Quick shop
              </p>
              <div className="flex flex-wrap gap-1.5 px-0.5">
                {CATALOG_DISCOVERY_CHIPS.map((chip) => (
                  <button
                    key={`${chip.shopFor}-${chip.productType}`}
                    type="button"
                    role="option"
                    onClick={() =>
                      goCatalogHref(
                        buildCatalogShopHref(
                          chip.shopFor,
                          chip.productType,
                          inferMetalFromPathname(pathname)
                        )
                      )
                    }
                    className="rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1.5 text-left text-xs font-medium text-slate-200 transition-colors hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-amber-100"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {browseHits.length > 0 ? (
            <div className={showDiscovery ? "mt-1 border-t border-slate-300/15 pt-1" : undefined}>
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Collections
              </p>
              <ul className="space-y-0.5 px-1">
                {browseHits.map((row) => (
                  <li key={`${row.styleSlug}-${row.subSlug}`}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => goCatalogHref(row.catalogHref)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-300/12"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500/90">
                        <LayoutGrid className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-[13px] font-semibold leading-snug text-slate-100">
                          {row.styleName} · {row.subcategoryName}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {browseHint(row)}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-slate-600" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {fuseHits.length > 0 ? (
            <div
              className={
                browseHits.length > 0 || synonymMatch
                  ? "mt-1 border-t border-slate-300/15 pt-1"
                  : undefined
              }
            >
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Products
              </p>
              <ul className="space-y-0.5 px-1">
                {fuseHits.map((row) => (
                  <li key={`${row.key}-${row.catalogHref}`}>
                    <Link
                      role="option"
                      href={row.productHref}
                      scroll={false}
                      onClick={() => {
                        setOpen(false);
                        setRaw("");
                      }}
                      className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-slate-300/12"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-800/90 text-slate-400">
                        <Package className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-100">
                          {row.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-600">
                          <span className="text-slate-600">{row.styleName}</span>
                          <span className="mx-1 text-slate-600">·</span>
                          <span>{row.subcategoryName}</span>
                          {row.audience ? (
                            <>
                              <span className="mx-1 text-slate-600">·</span>
                              <span>{catalogAudienceLabel(row.audience)}</span>
                            </>
                          ) : null}
                          {row.sku ? (
                            <>
                              <span className="mx-1 text-slate-600">·</span>
                              <span className="font-mono text-slate-600">{row.sku}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {synonymMatch ? (
            <div
              className={
                fuseHits.length > 0 || browseHits.length > 0
                  ? "mt-1 border-t border-slate-300/15 pt-1"
                  : undefined
              }
            >
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Suggested
              </p>
              <button
                type="button"
                role="option"
                className="group mx-1.5 mb-1 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/12 to-amber-600/5 px-3 py-2.5 text-left transition-colors hover:from-amber-500/16 hover:to-amber-600/10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goCatalogHref(synonymMatch.href);
                }}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                  <LayoutGrid className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-slate-100">
                    {synonymMatch.label}
                  </span>
                  {synonymMatch.hint ? (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {synonymMatch.hint}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="size-4 shrink-0 text-amber-500/70 transition group-hover:translate-x-0.5" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
