"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, LayoutGrid, Sparkles } from "lucide-react";
import {
  normalizeSearchQuery,
  resolveSearchSynonym,
  shouldSkipSearchSynonym,
} from "@/lib/searchSynonyms";
import { SEARCH_PATH } from "@/lib/routes";
import {
  buildFuseForSearchRecords,
  flattenCatalogToSearchRecords,
  getCatalogForSearchIndex,
  type SearchIndexRecord,
} from "@/lib/search-catalog-cache";

const DEBOUNCE_MS = 300;
const FUSE_LIMIT = 8;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

type SmartSearchProps = {
  /** Tighter layout for the mobile header row. */
  compact?: boolean;
  className?: string;
};

export default function SmartSearch({
  compact = false,
  className = "",
}: SmartSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const debounced = useDebouncedValue(raw, DEBOUNCE_MS);
  const [records, setRecords] = useState<SearchIndexRecord[]>([]);
  const [fuseReady, setFuseReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getCatalogForSearchIndex().then((cats) => {
      if (cancelled) return;
      setRecords(flattenCatalogToSearchRecords(cats));
      setFuseReady(true);
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
    return fuse.search(debounced, { limit: FUSE_LIMIT }).map((r) => r.item);
  }, [fuse, debounced, normalized]);

  const showPanel =
    open && (synonymMatch || fuseHits.length > 0) && normalized.length >= 2;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const goToSearchPage = useCallback(
    (q: string) => {
      const t = q.trim();
      if (!t) return;
      const n = normalizeSearchQuery(t);
      if (!shouldSkipSearchSynonym(n)) {
        const syn = resolveSearchSynonym(t);
        if (syn) {
          router.push(syn.href);
          setOpen(false);
          setRaw("");
          return;
        }
      }
      router.push(`${SEARCH_PATH}?q=${encodeURIComponent(t)}`);
      setOpen(false);
    },
    [router]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goToSearchPage(raw);
  };

  const inputCls = compact
    ? "h-9 pl-9 pr-3 text-sm"
    : "h-10 pl-10 pr-3 text-sm md:text-[15px]";

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <form onSubmit={onSubmit} className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search jewellery, SKU, barcode…"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={`w-full rounded-xl border border-white/10 bg-slate-900/90 text-slate-100 shadow-inner outline-none ring-amber-500/0 transition-[box-shadow,border-color] placeholder:text-slate-500 focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/25 ${inputCls}`}
          aria-label="Search catalogue"
          aria-expanded={showPanel}
          aria-controls="smart-search-results"
        />
      </form>

      {showPanel ? (
        <div
          id="smart-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] max-h-[min(70vh,22rem)] overflow-y-auto rounded-xl border border-white/10 bg-slate-900/98 py-1 shadow-2xl shadow-black/50 backdrop-blur-md"
        >
          {synonymMatch ? (
            <Link
              role="option"
              href={synonymMatch.href}
              onClick={() => {
                setOpen(false);
                setRaw("");
              }}
              className="flex items-start gap-3 border-b border-amber-500/15 bg-amber-500/8 px-3 py-2.5 transition-colors hover:bg-amber-500/12"
            >
              <LayoutGrid className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-amber-100">
                  {synonymMatch.label}
                </span>
                {synonymMatch.hint ? (
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {synonymMatch.hint}
                  </span>
                ) : null}
              </span>
              <Sparkles className="size-4 shrink-0 text-amber-500/80" />
            </Link>
          ) : null}

          {fuseHits.map((row) => (
            <Link
              key={`${row.key}-${row.catalogHref}`}
              role="option"
              href={row.productHref}
              onClick={() => {
                setOpen(false);
                setRaw("");
              }}
              className="flex flex-col gap-0.5 border-b border-white/5 px-3 py-2 last:border-b-0 hover:bg-white/6"
            >
              <span className="truncate font-medium text-slate-100">
                {row.name}
              </span>
              <span className="truncate text-xs text-slate-400">
                {row.styleName} · {row.subcategoryName}
                {row.sku ? ` · ${row.sku}` : ""}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
