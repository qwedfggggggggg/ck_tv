import { SearchResult } from '@/lib/types';

export interface BackendConfig {
  key: string;
  name: string;
  enabled: boolean;
}

export interface BackendPlayInfo {
  type: 'iframe' | 'direct';
  url: string;
}

const FANQIE_API_BASE = 'http://101.35.133.34:5000';

export async function searchBilibili(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const list = data?.data?.result || [];
    return list.slice(0, 10).map((item: any) => ({
      id: `bilibili:${item.bvid}`,
      title: item.title?.replace(/<[^>]+>/g, '') || '',
      poster: item.pic || '',
      episodes: [{ name: '播放', url: item.bvid }],
      source: 'backend:bilibili',
      source_name: '哔哩哔哩',
      year: item.pubdate ? new Date(item.pubdate * 1000).getFullYear().toString() : 'unknown',
      desc: item.description || '',
    }));
  } catch {
    return [];
  }
}

export async function searchYoutube(query: string): Promise<SearchResult[]> {
  const instances = [
    'https://inv.nadeko.net',
    'https://invidious.private.coffee',
    'https://invidious.snopyta.org',
  ];

  const tryInstance = async (instance: string) => {
    const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) throw new Error('non-ok response');
    const list = await resp.json();
    if (!Array.isArray(list)) throw new Error('invalid response');
    return list.filter((v: any) => v.type === 'video').slice(0, 10).map((item: any) => ({
      id: `youtube:${item.videoId}`,
      title: item.title || '',
      poster: item.videoThumbnails?.[3]?.url || item.videoThumbnails?.[0]?.url || '',
      episodes: [{ name: '播放', url: item.videoId }],
      source: 'backend:youtube',
      source_name: 'YouTube',
      year: item.published ? new Date(item.published * 1000).getFullYear().toString() : 'unknown',
      desc: item.description || '',
    }));
  };

  try {
    return await Promise.any(instances.map(tryInstance));
  } catch {
    return [];
  }
}

export async function searchArchive(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title,description,publicdate,mediatype&rows=10&page=1&output=json`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const docs = data?.response?.docs || [];
    return docs.filter((d: any) => d.mediatype === 'movie' || d.mediatype === 'video').map((item: any) => ({
      id: `archive:${item.identifier}`,
      title: item.title || '',
      poster: `https://archive.org/services/img/${item.identifier}`,
      episodes: [{ name: '播放', url: item.identifier }],
      source: 'backend:archive',
      source_name: 'Archive.org',
      year: item.publicdate ? item.publicdate.slice(0, 4) : '',
      desc: item.description || '',
    }));
  } catch {
    return [];
  }
}

export async function searchFanqieShortDrama(query: string): Promise<SearchResult[]> {
  try {
    const resp = await fetch(
      `${FANQIE_API_BASE}/api/search?key=${encodeURIComponent(query)}&tab_type=11`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    const list = data?.list || data?.data?.list || [];
    return list.slice(0, 20).map((item: any) => ({
      id: `fanqie:${item.book_id || item.series_id}`,
      title: item.book_name || item.title || '',
      poster: item.cover_url || item.thumb_url || '',
      episodes: [{ name: '播放', url: `fanqie:${item.book_id || item.series_id}` }],
      source: 'backend:fanqie',
      source_name: '番茄短剧',
      year: '',
      desc: item.description || item.desc || '',
    }));
  } catch {
    return [];
  }
}

export async function getFanqieEpisodes(
  bookId: string
): Promise<{ name: string; url: string }[] | null> {
  try {
    const dirResp = await fetch(`${FANQIE_API_BASE}/api/directory?book_id=${bookId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!dirResp.ok) return null;
    const dirData = await dirResp.json();
    const chapterList = dirData?.list || dirData?.data?.list || [];

    if (!Array.isArray(chapterList) || chapterList.length === 0) return null;

    // 并发上限 6，避免打满远程 API
    const CONCURRENCY = 6;
    const results: { name: string; url: string }[] = [];
    for (let i = 0; i < chapterList.length; i += CONCURRENCY) {
      const batch = chapterList.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (ch: any) => {
        const itemId = ch.item_id || ch.chapter_id;
        const name = ch.chapter_name || ch.title || `第${ch.chapter_num || '?'}集`;
        try {
          const contentResp = await fetch(
            `${FANQIE_API_BASE}/api/content?tab=%E7%9F%AD%E5%89%A7&item_id=${itemId}`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (!contentResp.ok) return { name, url: '' };
          const contentData = await contentResp.json();
          const videoUrl = contentData?.url || contentData?.data?.url || '';
          return { name, url: videoUrl };
        } catch {
          return { name, url: '' };
        }
      }));
      results.push(...batchResults);
    }
    const episodes = results;
    const valid = episodes.filter((ep) => ep.url);
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

export async function getFanqieDetail(
  bookId: string
): Promise<SearchResult | null> {
  try {
    const [detailResp, episodes] = await Promise.all([
      fetch(`${FANQIE_API_BASE}/api/detail?book_id=${bookId}`, {
        signal: AbortSignal.timeout(5000),
      }),
      getFanqieEpisodes(bookId),
    ]);

    let title = '',
      poster = '',
      desc = '';
    if (detailResp.ok) {
      const detailData = await detailResp.json();
      const book = detailData?.data || detailData;
      title = book.book_name || '';
      poster = book.cover_url || '';
      desc = book.description || '';
    }

    if (!episodes || episodes.length === 0) return null;

    return {
      id: `fanqie:${bookId}`,
      title,
      poster,
      episodes,
      source: 'backend:fanqie',
      source_name: '番茄短剧',
      year: '',
      desc,
    };
  } catch {
    return null;
  }
}

export function getBackendPlayInfo(result: SearchResult): BackendPlayInfo | null {
  if (result.source === 'backend:bilibili' && result.episodes.length > 0) {
    return { type: 'iframe', url: `https://player.bilibili.com/player.html?bvid=${result.episodes[0].url}` };
  }
  if (result.source === 'backend:youtube' && result.episodes.length > 0) {
    return { type: 'iframe', url: `https://www.youtube.com/embed/${result.episodes[0].url}?autoplay=1` };
  }
  if (result.source === 'backend:archive' && result.episodes.length > 0) {
    return { type: 'iframe', url: `https://archive.org/details/${result.episodes[0].url}` };
  }
  if (result.source === 'backend:fanqie' && result.episodes.length > 0) {
    return { type: 'direct', url: result.episodes[0].url };
  }
  return null;
}

export const BACKEND_KEYS = ['youtube', 'archive', 'fanqie'] as const;
export type BackendKey = typeof BACKEND_KEYS[number];

export async function searchAllBackends(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled([
    searchYoutube(query),
    searchArchive(query),
    searchFanqieShortDrama(query),
  ]);
  return results
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
