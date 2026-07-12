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
          return {
            key: site.key,
            name: site.name,
            status: ok ? (ping > 2000 ? 'slow' as const : 'ok' as const) : 'dead' as const,
            ping,
            checkedAt: Date.now(),
          };
        } catch {
          return {
            key: site.key,
            name: site.name,
            status: 'dead' as const,
            ping: Date.now() - start,
            checkedAt: Date.now(),
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
