# Search Performance & Category Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Optimize 3 pain points — search speed, duplicate results, missing category browsing

**Architecture:**
1. Batch CMS source requests in waves (15 at a time), sort by health score, persist dead source detection to KV
2. Server-side dedup via title similarity grouping, add `all_sources` field
3. New `/browse` page using CMS classify API with category tabs

**Tech Stack:** Next.js (edge runtime), Cloudflare KV, text similarity algorithm (existing)

---

### Task 1: Batch source requests in search API

**Files:**
- Modify: `src/lib/dead-source-cache.ts`
- Modify: `src/app/api/search/route.ts`

- [ ] **Step 1: Enhance dead-source-cache with sorting and KV persistence**

Add `getSourcesSortedByHealth()` returning source keys prioritized by score. Add serialization methods for KV.

```typescript
// src/lib/dead-source-cache.ts additions

export function getSourcesSortedByHealth(sources: { key: string }[]): { key: string }[] {
  return [...sources].sort((a, b) => {
    const scoreA = getReliabilityScore(a.key);
    const scoreB = getReliabilityScore(b.key);
    return scoreB - scoreA;
  });
}

export function serializeHealthData(): Record<string, SourceHealthEntry> {
  const obj: Record<string, SourceHealthEntry> = {};
  healthMap.forEach((v, k) => { obj[k] = v; });
  return obj;
}

export function deserializeHealthData(data: Record<string, SourceHealthEntry>): void {
  for (const [key, entry] of Object.entries(data)) {
    healthMap.set(key, entry);
  }
}
```

- [ ] **Step 2: Add KV load/save health data in search route**

```typescript
// src/app/api/search/route.ts additions
import { getConfig } from '@/lib/config';
import { getKV } from '@/lib/kv';

const HEALTH_KV_KEY = 'source_health_data';

async function loadHealthFromKV(): Promise<void> {
  try {
    const kv = await getKV();
    if (!kv) return;
    const data = await kv.get(HEALTH_KV_KEY, 'json');
    if (data) deserializeHealthData(data as Record<string, SourceHealthEntry>);
  } catch { /* ignore */ }
}

async function saveHealthToKV(): Promise<void> {
  try {
    const kv = await getKV();
    if (!kv) return;
    await kv.put(HEALTH_KV_KEY, JSON.stringify(serializeHealthData()), { expirationTtl: 86400 });
  } catch { /* ignore */ }
}
```

- [ ] **Step 3: Batch the source requests in waves of 15**

Replace the single `Promise.allSettled` with batched execution:

```typescript
// src/app/api/search/route.ts — replace the search block

// Load health data from KV
await loadHealthFromKV();

// Sort sources by health score (best first)
const sortedSites = getSourcesSortedByHealth(apiSites);

const BATCH_SIZE = 15;
let allSettled: PromiseSettledResult<any[]>[] = [];

for (let i = 0; i < sortedSites.length; i += BATCH_SIZE) {
  const batch = sortedSites.slice(i, i + BATCH_SIZE);
  const batchPromises = batch.map(site => searchFromApi(site, query));
  const batchResults = await Promise.allSettled(batchPromises);
  allSettled = [...allSettled, ...batchResults];

  // Record per-source health
  batch.forEach((site, idx) => {
    const r = batchResults[idx];
    const success = r.status === 'fulfilled' && r.value.length > 0;
    recordSearchResult(site.key, success);
  });
}

// Save health data back to KV
await saveHealthToKV();
```

- [ ] **Step 4: Check if KV module exists or create it**

```typescript
// Check if src/lib/kv.ts already exists
```

---

### Task 2: Server-side dedup with all_sources

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/search/route.ts`

- [ ] **Step 1: Add all_sources to SearchResult type**

```typescript
// src/lib/types.ts
export interface SearchResult {
  id: string;
  title: string;
  poster: string;
  episodes: { name: string; url: string }[];
  source: string;
  source_name: string;
  class?: string;
  year: string;
  desc?: string;
  type_name?: string;
  douban_id?: number;
  remark?: string;
  all_sources?: { key: string; name: string }[];  // NEW
}
```

- [ ] **Step 2: Add dedup function to search route**

```typescript
// src/app/api/search/route.ts — add dedup function

interface InternalResult extends SearchResult {
  _sourceName: string;
  _sourceKey: string;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, '')
    .replace(/[第季].*$/, '')
    .trim();
}

function dedupResults(results: SearchResult[]): SearchResult[] {
  const groups = new Map<string, SearchResult[]>();

  for (const r of results) {
    const key = normalizeTitle(r.title);
    if (!key) continue;
    const existing = groups.get(key) || [];
    existing.push(r);
    groups.set(key, existing);
  }

  const merged: SearchResult[] = [];
  for (const [, group] of groups) {
    // Pick best entry (most complete data)
    const best = group.reduce((a, b) => {
      const scoreA = (a.episodes?.length ?? 0) + (a.poster ? 2 : 0) + (a.year && a.year !== 'unknown' ? 1 : 0);
      const scoreB = (b.episodes?.length ?? 0) + (b.poster ? 2 : 0) + (b.year && b.year !== 'unknown' ? 1 : 0);
      return scoreB > scoreA ? b : a;
    });

    // Collect all unique sources
    const seen = new Set<string>();
    const all_sources: { key: string; name: string }[] = [];
    for (const r of group) {
      const key = r.source || '';
      if (key && !seen.has(key)) {
        seen.add(key);
        all_sources.push({ key, name: r.source_name || key });
      }
    }

    merged.push({ ...best, all_sources });
  }

  // Sort by source count (most sources first)
  merged.sort((a, b) => (b.all_sources?.length ?? 0) - (a.all_sources?.length ?? 0));
  return merged;
}
```

- [ ] **Step 3: Apply dedup in search route before returning**

Replace `const responseData = { results }` with:
```typescript
const deduped = dedupResults(results);
const responseData = { results: deduped };
```

---

### Task 3: Category browsing page

**Files:**
- Create: `src/app/browse/page.tsx`
- Create: `src/app/api/classify/route.ts`

- [ ] **Step 1: Create browse API endpoint**

```typescript
// src/app/api/classify/route.ts
import { NextResponse } from 'next/server';
import { getConfig, API_CONFIG } from '@/lib/config';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || ''; // 电影, 电视剧, 动漫, 综艺
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  const config = await getConfig();
  const activeSources = config.SourceConfig.filter(s => !s.disabled);

  // Try each source until we get results
  for (const source of activeSources) {
    try {
      const apiBase = source.api.replace(/\/$/, '');
      const classifyUrl = `${apiBase}${API_CONFIG.classify.path.replace('{type_id}', type).replace('{page}', String(page)).replace('{limit}', String(limit))}`;

      const resp = await fetch(classifyUrl, {
        headers: API_CONFIG.classify.headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data?.list?.length) {
        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'public, max-age=300' },
        });
      }
    } catch { continue; }
  }

  return NextResponse.json({ list: [], pagecount: 0 });
}
```

- [ ] **Step 2: Create browse page UI**

```typescript
// src/app/browse/page.tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';
import { SearchResult } from '@/lib/types';

const CATEGORIES = [
  { label: '全部', value: '' },
  { label: '电影', value: '1' },
  { label: '电视剧', value: '2' },
  { label: '动漫', value: '4' },
  { label: '综艺', value: '3' },
];

function BrowseClient() {
  const [activeType, setActiveType] = useState('');
  const [items, setItems] = useState<SearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchItems = async (type: string, pageNum: number) => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/classify?type=${type}&page=${pageNum}&limit=24`);
      const data = await resp.json();
      if (pageNum === 1) {
        setItems(data.list || []);
      } else {
        setItems(prev => [...prev, ...(data.list || [])]);
      }
      setHasMore(pageNum < (data.pagecount || 1));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchItems(activeType, 1);
  }, [activeType]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchItems(activeType, next);
  };

  return (
    <PageLayout>
      <div className='px-4 sm:px-10 py-4 sm:py-8'>
        {/* Category Tabs */}
        <div className='flex gap-2 mb-8 overflow-x-auto'>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setActiveType(cat.value)}
              className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeType === cat.value
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className='grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-5 lg:gap-x-6'>
          {items.map((item, idx) => (
            <VideoCard
              key={`${item.id}-${idx}`}
              from='search'
              items={[item]}
              query={item.title}
            />
          ))}
        </div>

        {/* Load More */}
        {hasMore && (
          <div className='flex justify-center mt-8'>
            <button
              onClick={loadMore}
              disabled={loading}
              className='px-8 py-2 bg-green-500 text-white rounded-full text-sm hover:bg-green-600 disabled:opacity-50'
            >
              {loading ? '加载中...' : '加载更多'}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" /></div>}>
      <BrowseClient />
    </Suspense>
  );
}
```

- [ ] **Step 3: Add classify path to API_CONFIG in config.ts**

```typescript
// src/lib/config.ts — add to API_CONFIG
// API_CONFIG.classify = {
//   path: '/index.php/vod/type/id/{type_id}/page/{page}.html',
//   headers: { 'User-Agent': '...' },
// };

// Or using the JSON API path:
// path: '/api.php/provide/vod?ac=detail&t={type_id}&pg={page}'
```

---

### Task 4: Add browse to navigation

**Files:**
- Modify: `src/components/PageLayout.tsx`

- [ ] **Step 1: Read PageLayout to find navigation and add Browse link**

Add browser link next to search/home. Look for existing nav items pattern.

---

### Task 5: Build and deploy

- [ ] **Step 1: Regenerate config, build, verify**

```bash
pnpm gen:runtime && pnpm gen:manifest && npx next build
```

- [ ] **Step 2: Deploy to Cloudflare**

```bash
npx @cloudflare/next-on-pages --experimental-minify && npx wrangler@3 pages deploy .vercel/output/static --project-name ck-tv
```
