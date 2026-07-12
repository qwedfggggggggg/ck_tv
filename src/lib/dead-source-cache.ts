let deadSourceCache: Set<string> | null = null;
let deadSourceCacheTime = 0;
const DEAD_CACHE_TTL = 10 * 60 * 1000;

export function updateDeadSourceCache(deadKeys: string[]) {
  deadSourceCache = new Set(deadKeys);
  deadSourceCacheTime = Date.now();
}

export function isSourceDead(key: string): boolean {
  if (Date.now() - deadSourceCacheTime > DEAD_CACHE_TTL) return false;
  return deadSourceCache?.has(key) ?? false;
}
