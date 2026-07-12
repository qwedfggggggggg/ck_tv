import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { API_CONFIG } from '@/lib/config';
import { updateDeadSourceCache } from '@/lib/dead-source-cache';

export const runtime = 'edge';

interface SourceHealth {
  key: string;
  name: string;
  status: 'ok' | 'slow' | 'dead';
  ping: number;
  checkedAt: number;
  errorType?: 'timeout' | 'connection' | 'unknown';
}

export async function GET() {
  const config = await getConfig();
  const sites = config.SourceConfig.filter((s) => !s.disabled);

  const results: SourceHealth[] = [];
  const concurrency = 20;

  for (let i = 0; i < sites.length; i += concurrency) {
    const batch = sites.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (site) => {
        const start = Date.now();
        try {
          const url = site.api + API_CONFIG.search.path + '测试';
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const resp = await fetch(url, {
            headers: API_CONFIG.search.headers,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const ping = Date.now() - start;
          const ok = resp.ok || resp.status === 404;
          let status: 'ok' | 'slow' | 'dead';
          if (ok) {
            status = ping > 2000 ? 'slow' : 'ok';
          } else {
            status = 'dead';
          }
          return {
            key: site.key,
            name: site.name,
            status,
            ping,
            checkedAt: Date.now(),
            ...(status === 'dead' ? { errorType: 'connection' as const } : {}),
          };
        } catch (error) {
          const errorType = error instanceof DOMException && error.name === 'AbortError'
            ? 'timeout' as const
            : 'unknown' as const;
          return {
            key: site.key,
            name: site.name,
            status: 'dead' as const,
            ping: Date.now() - start,
            checkedAt: Date.now(),
            errorType,
          };
        }
      })
    );
    results.push(...batchResults);
  }

  // 更新死源缓存，供搜索路由跳过失效源
  updateDeadSourceCache(results.filter((r) => r.status === 'dead').map((r) => r.key));

  return NextResponse.json({
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    slow: results.filter((r) => r.status === 'slow').length,
    dead: results.filter((r) => r.status === 'dead').length,
    sources: results.sort((a, b) => {
      const order = { dead: 0, slow: 1, ok: 2 };
      return (order[a.status] || 0) - (order[b.status] || 0);
    }),
    checkedAt: Date.now(),
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
