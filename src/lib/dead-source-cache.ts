interface SourceHealthEntry {
  score: number;
  attempts: number;
  lastChecked: number;
}

const healthMap = new Map<string, SourceHealthEntry>();
const CACHE_TTL = 10 * 60 * 1000;

// Called after every search attempt per source
export function recordSearchResult(key: string, success: boolean): void {
  const entry = healthMap.get(key) || { score: 0.5, attempts: 0, lastChecked: 0 };
  entry.attempts++;
  entry.lastChecked = Date.now();
  // EMA: success=+0.1, failure=-0.05, clamped [0,1]
  entry.score = Math.max(0, Math.min(1, entry.score + (success ? 0.1 : -0.05)));
  healthMap.set(key, entry);
}

export function getReliabilityScore(key: string): number {
  const entry = healthMap.get(key);
  if (!entry) return 0.5;
  // time-decay: lose 0.02 per hour since last check
  const hoursElapsed = (Date.now() - entry.lastChecked) / 3600000;
  return Math.max(0, entry.score - hoursElapsed * 0.02);
}

// Skip only when we have enough data AND score is low
export function shouldSkipSource(key: string): boolean {
  const entry = healthMap.get(key);
  if (!entry || entry.attempts < 3) return false;
  return getReliabilityScore(key) < 0.3;
}

// backward compat: route.ts imports isSourceDead
export function isSourceDead(key: string): boolean {
  return shouldSkipSource(key);
}

export function getSourceStats(): Array<{ key: string } & SourceHealthEntry> {
  const now = Date.now();
  const result: Array<{ key: string } & SourceHealthEntry> = [];
  healthMap.forEach((v, k) => {
    if (now - v.lastChecked < CACHE_TTL) {
      result.push({ key: k, ...v });
    }
  });
  return result.sort((a, b) => a.score - b.score);
}

// Keep backward compat: health API calls this
export function updateDeadSourceCache(deadKeys: string[]): void {
  const now = Date.now();
  for (const key of deadKeys) {
    healthMap.set(key, { score: 0, attempts: 5, lastChecked: now });
  }
  // Boost alive sources that aren't in deadKeys
  healthMap.forEach((entry, key) => {
    if (!deadKeys.includes(key) && entry.score < 0.5) {
      healthMap.set(key, { ...entry, score: 0.9, attempts: entry.attempts + 2 });
    }
  });
}

export function clearExpiredEntries(): void {
  const cutoff = Date.now() - CACHE_TTL;
  healthMap.forEach((entry, key) => {
    if (entry.lastChecked < cutoff) healthMap.delete(key);
  });
}
