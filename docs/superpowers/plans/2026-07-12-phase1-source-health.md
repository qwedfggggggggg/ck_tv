# Phase 1: Source Health System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace binary dead/alive source tracking with a continuous reliability scoring model, fed by both health checks and real search results.

**Architecture:** Module-level Map in `dead-source-cache.ts` stores per-source `{ score, attempts, lastChecked }`. Score is updated on every search attempt (exponential moving average). `search/route.ts` and `health/route.ts` both feed into the tracker. `search/route.ts` skips sources below threshold.

**Tech Stack:** TypeScript, Cloudflare Pages Edge Runtime, existing src/lib structure.

**Global Constraints:**
- All state lives in module-level variables (best-effort on CF Workers multi-instance)
- No persistent storage dependency for Phase 1
- 10-minute TTL on all cached state
- Score range [0, 1], threshold at 0.3

---

### Task 1: Rewrite dead-source-cache.ts with scoring model

**Files:**
- Modify: `src/lib/dead-source-cache.ts`

**Interfaces:**
- Produces: `recordSearchResult(key, success)`, `getReliabilityScore(key)`, `shouldSkipSource(key)`, `getSourceStats()`, `updateDeadSourceCache(deadKeys)` (kept for backward compat)

- [ ] **Read existing file**

```bash
cat src/lib/dead-source-cache.ts
```

- [ ] **Rewrite with scoring model**

Replace contents with:

```typescript
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
  for (const [key, entry] of healthMap) {
    if (!deadKeys.includes(key) && entry.score < 0.5) {
      healthMap.set(key, { ...entry, score: 0.9, attempts: entry.attempts + 2 });
    }
  }
}

export function clearExpiredEntries(): void {
  const cutoff = Date.now() - CACHE_TTL;
  for (const [key, entry] of healthMap) {
    if (entry.lastChecked < cutoff) healthMap.delete(key);
  }
}
```

### Task 2: Update search route to record per-source results

**Files:**
- Modify: `src/app/api/search/route.ts`

- [ ] **Read current search route**

```bash
cat src/app/api/search/route.ts
```

- [ ] **Replace `isSourceDead` import with `shouldSkipSource` + `recordSearchResult`**

Current:
```typescript
import { isSourceDead } from '@/lib/dead-source-cache';
```

Replace with:
```typescript
import { shouldSkipSource, recordSearchResult } from '@/lib/dead-source-cache';
```

- [ ] **Change source filter from `isSourceDead` to `shouldSkipSource`**

Current:
```typescript
apiSites = apiSites.filter((site) => !isSourceDead(site.key));
```

Replace with:
```typescript
apiSites = apiSites.filter((site) => !shouldSkipSource(site.key));
```

- [ ] **Add result recording after `Promise.allSettled`**

After the `settled` promise resolves, add:

```typescript
// Record per-source health
if (apiSites.length > 0) {
  settled.forEach((r, i) => {
    const key = apiSites[i].key;
    const success = r.status === 'fulfilled' && r.value.length > 0;
    recordSearchResult(key, success);
  });
}
```

- [ ] **Build check**

```bash
PASSWORD=cktv123456 pnpm pages:build 2>&1 | tail -5
```

### Task 3: Update health route to seed scores + improve classification

**Files:**
- Modify: `src/app/api/health/route.ts`

- [ ] **Read current health route**

```bash
cat src/app/api/health/route.ts
```

- [ ] **Add latency-based status classification**

In the per-source check, replace current status logic with:

```typescript
const ping = Date.now() - start;
let status: 'ok' | 'slow' | 'dead';
if (ok) {
  if (ping > 3000) status = 'slow';
  else if (ping > 2000) status = 'slow';
  else status = 'ok';
} else {
  status = 'dead';
}

// Classify error type if dead
let errorType: 'timeout' | 'connection' | 'parse' | 'unknown' = 'unknown';
if (!ok) {
  if (error?.name === 'AbortError') errorType = 'timeout';
  else errorType = 'connection';
}
```

Return `errorType` in the source result object.

- [ ] **Build check**

```bash
PASSWORD=cktv123456 pnpm pages:build 2>&1 | tail -5
```

### Task 4: Enhanced admin health tab

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Find the HealthStatus component in admin page**

```bash
grep -n "HealthStatus\|health" src/app/admin/page.tsx | head -20
```

- [ ] **Add status distribution summary**

Above the source list table, add a compact summary bar showing count of ok/slow/dead sources as colored labels:

```typescript
// Near the health display area, add:
<div className="flex gap-3 mb-4 text-sm">
  <span className="px-2 py-1 rounded bg-green-800 text-green-200">
    正常 {healthData.ok}
  </span>
  <span className="px-2 py-1 rounded bg-yellow-800 text-yellow-200">
    缓慢 {healthData.slow}
  </span>
  <span className="px-2 py-1 rounded bg-red-800 text-red-200">
    失效 {healthData.dead}
  </span>
  <span className="px-2 py-1 rounded bg-gray-700 text-gray-300">
    总计 {healthData.total}
  </span>
</div>
```

- [ ] **Build check**

```bash
PASSWORD=cktv123456 pnpm pages:build 2>&1 | tail -5
```

### Task 5: Deploy and verify

- [ ] **Deploy**

```bash
npx wrangler pages deploy
```

- [ ] **Verify health API**

```bash
curl -s "https://$(npx wrangler pages project list 2>/dev/null | grep ck-tv-73d)/api/health" --max-time 70 | python3 -c "import json,sys;d=json.load(sys.stdin);print(f'OK:{d[\"ok\"]} SLOW:{d[\"slow\"]} DEAD:{d[\"dead\"]}')"
```

- [ ] **Verify search still works**

```bash
curl -s "https://$(...)/api/search?q=test" --max-time 60 | python3 -c "import json,sys;d=json.load(sys.stdin);print(f'Results:{len(d[\"results\"])}')"
```
