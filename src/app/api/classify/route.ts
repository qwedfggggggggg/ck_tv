import { NextResponse } from 'next/server';

import { getConfig, API_CONFIG } from '@/lib/config';

export const runtime = 'edge';

interface ClassifyItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_year?: string;
  vod_class?: string;
  vod_play_url?: string;
}

interface ClassifyResponse {
  list?: ClassifyItem[];
  pagecount?: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || '';
  const page = parseInt(searchParams.get('page') || '1');

  const config = await getConfig();
  const activeSources = config.SourceConfig.filter(s => !s.disabled);

  for (const source of activeSources) {
    try {
      const apiBase = source.api.replace(/\/$/, '');
      const classifyUrl = `${apiBase}?ac=videolist&t=${type}&pg=${page}&h=24`;

      const resp = await fetch(classifyUrl, {
        headers: API_CONFIG.search.headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;
      const data: ClassifyResponse = await resp.json();
      if (data?.list?.length) {
        const list = data.list.map((item) => {
          let episodes: { name: string; url: string }[] = [];
          if (item.vod_play_url) {
            const firstSource = item.vod_play_url.split('$$$')[0];
            episodes = firstSource.split('#').map(ep => {
              const [name, url] = ep.split('$');
              return { name: name || '', url: url || '' };
            }).filter(ep => ep.url);
          }
          if (!episodes.length && item.vod_remarks) {
            episodes = [{ name: item.vod_remarks, url: item.vod_play_url?.split('$')[1] || '' }];
          }
          return {
            id: item.vod_id,
            title: item.vod_name,
            poster: item.vod_pic,
            episodes,
            source: source.key,
            source_name: source.name,
            year: item.vod_year?.match(/\d{4}/)?.[0] || '',
            class: item.vod_class || '',
          };
        });
        return NextResponse.json(
          { list, pagecount: data.pagecount || 1 },
          { headers: { 'Cache-Control': 'public, max-age=300' } }
        );
      }
    } catch { /* try next source */ }
  }

  return NextResponse.json({ list: [], pagecount: 0 });
}
