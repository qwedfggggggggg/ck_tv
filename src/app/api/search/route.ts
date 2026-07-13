import { NextResponse } from 'next/server';

import { searchAllBackends } from '@/lib/backends';
import { getCacheTime, getConfig } from '@/lib/config';
import { getReliabilityScore,recordSearchResult, shouldSkipSource } from '@/lib/dead-source-cache';
import { searchFromApi } from '@/lib/downstream';
import type { SearchResult } from '@/lib/types';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'edge';

const searchCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
const BATCH_SIZE = 15;

async function getKvCache(query: string) {
  try {
    const kv = (globalThis as any).CKTV_SEARCH_CACHE;
    if (!kv) return null;
    const cached = await kv.get(query, 'json');
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    return null;
  } catch { return null; }
}

async function setKvCache(query: string, data: any) {
  try {
    const kv = (globalThis as any).CKTV_SEARCH_CACHE;
    if (!kv) return;
    await kv.put(query, JSON.stringify({
      data,
      expiresAt: Date.now() + 30 * 60 * 1000,
    }), { expirationTtl: 1800 });
  } catch { /* ignore */ }
}

function getDynamicTimeout(key: string): number {
  const score = getReliabilityScore(key);
  if (score > 0.7) return 800;
  if (score > 0.3) return 1500;
  return 0;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]/g, '')
    .replace(/第\d+[季部]$/, '')
    .replace(/[季部]$/, '')
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
  for (const [, group] of Array.from(groups)) {
    const best = group.reduce((a, b) => {
      const scoreA = (a.episodes?.length ?? 0) + (a.poster ? 2 : 0) + (a.year && a.year !== 'unknown' ? 1 : 0);
      const scoreB = (b.episodes?.length ?? 0) + (b.poster ? 2 : 0) + (b.year && b.year !== 'unknown' ? 1 : 0);
      return scoreB > scoreA ? b : a;
    });

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

  merged.sort((a, b) => (b.all_sources?.length ?? 0) - (a.all_sources?.length ?? 0));
  return merged;
}

const OVERALL_TIMEOUT_MS = 12000;

export async function GET(request: Request) {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('search timeout')), OVERALL_TIMEOUT_MS)
  );

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  }

  const now = Date.now();
  const cached = searchCache.get(query);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'X-Cache': 'HIT',
      },
    });
  }

  const kvCacheHit = await getKvCache(query);
  if (kvCacheHit) {
    searchCache.set(query, { data: kvCacheHit, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(kvCacheHit, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'X-Cache': 'HIT-KV',
      },
    });
  }

  try {
    const result = await Promise.race([
      (async () => {
        const config = await getConfig();
        let apiSites = config.SourceConfig.filter((site) => !site.disabled);

    apiSites = apiSites.filter((site) => !shouldSkipSource(site.key));

    const sourcesParam = searchParams.get('sources');
    if (sourcesParam) {
      const allowedKeys = sourcesParam.split(',').map(s => s.trim());
      apiSites = apiSites.filter(site => allowedKeys.includes(site.key));
    }

    const batchParam = searchParams.get('batch');
    const batchIndex = batchParam ? Math.max(1, parseInt(batchParam)) : 1;

    const dedupParam = searchParams.get('dedup');
    const skipDedup = dedupParam === '0' || dedupParam === 'false';

    const activeSites = apiSites.filter(site => {
      const timeout = getDynamicTimeout(site.key);
      return timeout > 0;
    });

    const allSettled: PromiseSettledResult<Awaited<ReturnType<typeof searchFromApi>>>[] = [];

    const startIdx = (batchIndex - 1) * BATCH_SIZE;
    const batch = activeSites.slice(startIdx, startIdx + BATCH_SIZE);
    const batchPromises = batch.map(site =>
      searchFromApi(site, query, getDynamicTimeout(site.key))
    );
    let batchResults: PromiseSettledResult<PromiseSettledResult<SearchResult[]>[]>;
    let backendSettled: PromiseSettledResult<SearchResult[]>;
    if (batchIndex === 1) {
      const [b, s] = await Promise.allSettled([
        Promise.allSettled(batchPromises),
        searchAllBackends(query),
      ]);
      batchResults = b;
      backendSettled = s;
    } else {
      batchResults = { status: 'fulfilled', value: await Promise.allSettled(batchPromises) };
      backendSettled = { status: 'fulfilled', value: [] };
    }

    if (batchResults.status === 'fulfilled') {
      allSettled.push(...batchResults.value);
    }
    const backendResults = backendSettled.status === 'fulfilled' ? backendSettled.value : [];

    if (activeSites.length > 0) {
      allSettled.forEach((r, i) => {
        const key = activeSites[startIdx + i]?.key;
        if (!key) return;
        const success = r.status === 'fulfilled' && r.value.length > 0;
        recordSearchResult(key, success);
      });
    }
    let results = allSettled
      .filter((x): x is PromiseFulfilledResult<any> => x.status === 'fulfilled')
      .flatMap((x) => x.value);
    results = [...results, ...backendResults];
    if (!config.SiteConfig.DisableYellowFilter) {
      results = results.filter((x: { type_name?: string }) => {
        const typeName = x.type_name || '';
        return !yellowWords.some((w: string) => typeName.includes(w));
      });
    }
    const cacheTime = await getCacheTime();
    const finalResults = skipDedup ? results : dedupResults(results);
    const hasMore = (startIdx + BATCH_SIZE) < activeSites.length;
    const responseData = { results: finalResults, hasMore };
    searchCache.set(query, { data: responseData, expiresAt: now + CACHE_TTL_MS });
    await setKvCache(query, responseData);
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'X-Cache': 'MISS',
      },
    });
  })(),
  timeoutPromise,
]) as Awaited<ReturnType<typeof NextResponse.json>>;
    return result;
  } catch {
    return NextResponse.json({ results: [] });
  }
}
