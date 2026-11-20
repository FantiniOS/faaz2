/**
 * Cache leve em memória no cliente (Stale-While-Revalidate de ~30s)
 * para navegação instantânea entre abas do painel Web sem perder frescor.
 */

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

export const DEFAULT_SWR_TTL_MS = 30_000;

export function getClientCache<T>(
  key: string,
  ttlMs: number = DEFAULT_SWR_TTL_MS
): { data: T; isFresh: boolean } | null {
  if (typeof window === "undefined") return null;
  const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const ageMs = Date.now() - entry.updatedAt;
  return {
    data: entry.data,
    isFresh: ageMs < ttlMs,
  };
}

export function setClientCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  memoryStore.set(key, {
    data,
    updatedAt: Date.now(),
  });
}

export function invalidateClientCache(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    memoryStore.clear();
    return;
  }
  for (const k of Array.from(memoryStore.keys())) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
      memoryStore.delete(k);
    }
  }
}
