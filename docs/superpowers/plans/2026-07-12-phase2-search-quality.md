# Phase 2: Search Result Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement plan task-by-task.

**Goal:** Improve search result deduplication from exact-match to fuzzy similarity, add confidence-based sorting, pagination-level dedup, and per-card source selection.

**Architecture:** New `src/lib/similarity.ts` for trigram similarity. Client-side grouping/sorting logic rewritten in `search/page.tsx`. `VideoCard` gains source badge popover. `downstream.ts` deduplicates within multi-page results.

**Tech Stack:** TypeScript, Next.js client components, Tailwind CSS.

**Global Constraints:**
- No new external dependencies
- Trigram similarity threshold at 0.85
- Confidence score formula: `source_reliability*0.3 + title_quality*0.25 + has_year*0.15 + has_poster*0.1 + has_episodes*0.1 + source_count*0.1`

---

### Task 1: Create similarity.ts with trigram matching

**Files:**
- Create: `src/lib/similarity.ts`

**Interfaces:**
- Produces: `trigramSimilarity(a, b)`, `groupSimilar(items, options)`

- [ ] **Create similarity.ts**

```typescript
export function trigramSimilarity(a: string, b: string): number {
  const trigramsA = new Set<string>();
  for (let i = 0; i < a.length - 2; i++) trigramsA.add(a.slice(i, i + 3));
  if (trigramsA.size === 0) return a === b ? 1 : 0;

  let matchCount = 0;
  for (let i = 0; i < b.length - 2; i++) {
    if (trigramsA.has(b.slice(i, i + 3))) matchCount++;
  }
  return matchCount / trigramsA.size;
}

export interface GroupOptions {
  threshold?: number;      // default 0.85
  requireSameYear?: boolean; // default true
  requireSameType?: boolean; // default true (movie=1ep vs tv=multi-ep)
}

export function groupSimilar<T extends { title: string; year?: string; episodes?: any[] }>(
  items: T[],
  options: GroupOptions = {}
): T[][] {
  const { threshold = 0.85, requireSameYear = true, requireSameType = true } = options;
  const groups: T[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const group: T[] = [items[i]];
    used.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (requireSameYear && items[i].year !== items[j].year) continue;
      if (requireSameType) {
        const typeI = (items[i].episodes?.length ?? 0) > 1 ? 'tv' : 'movie';
        const typeJ = (items[j].episodes?.length ?? 0) > 1 ? 'tv' : 'movie';
        if (typeI !== typeJ) continue;
      }
      const score = trigramSimilarity(
        items[i].title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, ''),
        items[j].title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
      );
      if (score >= threshold) {
        group.push(items[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}
```

### Task 2: Integrate fuzzy grouping into search page

**Files:**
- Modify: `src/app/search/page.tsx`

- [ ] **Read current search page**

```bash
cat src/app/search/page.tsx
```

- [ ] **Add imports** at top:

```typescript
import { groupSimilar, trigramSimilarity } from '@/lib/similarity';
```

- [ ] **Replace the grouping logic in the `useMemo` (or equivalent)**

Find where results are grouped by `normalizeKey`. Replace with:
```typescript
const groupedItems = useMemo(() => {
  if (!searchResults.length) return [];
  const groups = groupSimilar(searchResults, { threshold: 0.85 });
  return groups.map((group) => {
    const best = group.reduce((a, b) =>
      (a.source_name && getReliabilityScore?.(a.source) ?? 0.5) >
      (b.source_name && getReliabilityScore?.(b.source) ?? 0.5) ? a : b
    );
    return { ...best, allSourceNames: group.map((r) => r.source_name).filter(Boolean) };
  });
}, [searchResults]);
```

Note: `getReliabilityScore` is server-only (Edge). The client won't have it. Replace with a simpler client-side heuristic: prefer results with episodes > prefer results with poster > prefer results with year.

- [ ] **Add confidence scoring sort**

After grouping, sort groups by:
1. Group size (more sources = more reliable) desc
2. Has valid year (year !== 'unknown' && year !== '') 
3. Has poster
4. Has episodes

```typescript
const sortedGroups = [...groupedItems].sort((a, b) => {
  const aCount = a.allSourceNames?.length ?? 1;
  const bCount = b.allSourceNames?.length ?? 1;
  if (bCount !== aCount) return bCount - aCount;
  const aHasYear = a.year && a.year !== 'unknown' ? 1 : 0;
  const bHasYear = b.year && b.year !== 'unknown' ? 1 : 0;
  if (bHasYear !== aHasYear) return bHasYear - aHasYear;
  const aHasPoster = a.poster ? 1 : 0;
  const bHasPoster = b.poster ? 1 : 0;
  if (bHasPoster !== aHasPoster) return bHasPoster - aHasPoster;
  const aHasEps = (a.episodes?.length ?? 0) > 0 ? 1 : 0;
  const bHasEps = (b.episodes?.length ?? 0) > 0 ? 1 : 0;
  if (bHasEps !== aHasEps) return bHasEps - aHasEps;
  return 0;
});
```

### Task 3: Pagination dedup in downstream.ts

**Files:**
- Modify: `src/lib/downstream.ts`

- [ ] **Read downstream.ts**

```bash
cat src/lib/downstream.ts
```

- [ ] **Add dedup in searchFromApi's multi-page section**

In `searchFromApi`, where additional pages are fetched and merged, add a dedup set using `vod_id`:

```typescript
// After all pages are fetched, deduplicate by vod_id within this source
const seenIds = new Set<string>();
const allResults: typeof results = [];
[...results, ...additionalResults.flat()].forEach((item) => {
  if (!seenIds.has(item.id)) {
    seenIds.add(item.id);
    allResults.push(item);
  }
});
return allResults;
```

Replace the current return that only uses `results` (page 1). The dedup happens on the combined list of page 1 + additional pages.

### Task 4: Version differentiation in VideoCard

**Files:**
- Modify: `src/components/VideoCard.tsx`

- [ ] **Read VideoCard.tsx**

```bash
cat src/components/VideoCard.tsx
```

- [ ] **Update the source badge area**

Find where `allSourceNames` or source badges are rendered. Add a clickable popover/dropdown showing all sources a video is available from. Keep existing behavior (click plays from first source) but add a small "▼" expand button that lists all sources for manual selection.

The popover:
```typescript
// state
const [showSources, setShowSources] = useState(false);

// in JSX, near the source badges
{allSourceNames && allSourceNames.length > 1 && (
  <div className="relative">
    <button
      onClick={(e) => { e.stopPropagation(); setShowSources(!showSources); }}
      className="text-xs text-gray-400 hover:text-white ml-1"
    >
      ▼ {allSourceNames.length}源
    </button>
    {showSources && (
      <div className="absolute bottom-full left-0 mb-1 bg-gray-800 border border-gray-700 rounded p-2 z-10 min-w-[140px]"
           onMouseLeave={() => setShowSources(false)}>
        {allSourceNames.map((name, i) => (
          <div key={i} className="text-xs text-gray-300 py-0.5 whitespace-nowrap">
            {i === 0 && '★ '}{name}
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

### Task 5: Build, deploy, verify

- [ ] **Build**

```bash
cd /Users/gehaoran/cktv && PASSWORD=cktv123456 pnpm pages:build 2>&1 | tail -5
```

- [ ] **Deploy**

```bash
npx wrangler pages deploy 2>&1 | tail -3
```

- [ ] **Verify search**

```bash
curl -s "https://<deploy-url>/api/search?q=test" --max-time 60 | python3 -c "
import json,sys;d=json.load(sys.stdin);print(f'Results:{len(d.get(\"results\",[]))}')"
```
