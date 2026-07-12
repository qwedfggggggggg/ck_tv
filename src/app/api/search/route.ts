import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { shouldSkipSource, recordSearchResult } from '@/lib/dead-source-cache';

export const runtime = 'edge';

const searchCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function GET(request: Request) {
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

  const config = await getConfig();
  let apiSites = config.SourceConfig.filter((site) => !site.disabled);

  // 跳过已知失效的源
  apiSites = apiSites.filter((site) => !shouldSkipSource(site.key));

  const sourcesParam = searchParams.get('sources');
  if (sourcesParam) {
    const allowedKeys = sourcesParam.split(',').map(s => s.trim());
    apiSites = apiSites.filter(site => allowedKeys.includes(site.key));
  }

  const searchPromises = apiSites.map((site) => searchFromApi(site, query));

  try {
    const settled = await Promise.allSettled(searchPromises);
    // Record per-source health
    if (apiSites.length > 0) {
      settled.forEach((r, i) => {
        const key = apiSites[i].key;
        const success = r.status === 'fulfilled' && r.value.length > 0;
        recordSearchResult(key, success);
      });
    }
    let results = settled
      .filter((x): x is PromiseFulfilledResult<any> => x.status === 'fulfilled')
      .flatMap((x) => x.value);
    if (!config.SiteConfig.DisableYellowFilter) {
      results = results.filter((x: { type_name?: string }) => {
        const typeName = x.type_name || '';
        return !yellowWords.some((w: string) => typeName.includes(w));
      });
    }
    const cacheTime = await getCacheTime();
    const responseData = { results };
    searchCache.set(query, { data: responseData, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'X-Cache': 'MISS',
      },
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
