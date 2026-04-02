export type CatalogCachePayload = {
  /** Mirrors GET /api/catalog categories — kept loose to avoid drift from client Category type. */
  categories: unknown[];
  rates: unknown[];
  ts: number;
};

const TTL_MS = 3 * 60 * 1000;

let memory: CatalogCachePayload | null = null;

export function readCatalogCache(): CatalogCachePayload | null {
  if (!memory) return null;
  if (Date.now() - memory.ts > TTL_MS) {
    memory = null;
    return null;
  }
  return memory;
}

export function writeCatalogCache(payload: Omit<CatalogCachePayload, "ts">): void {
  memory = { ...payload, ts: Date.now() };
}

export function clearCatalogCache(): void {
  memory = null;
}
