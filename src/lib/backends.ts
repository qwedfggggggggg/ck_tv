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
  return null;
}

export const BACKEND_KEYS = ['bilibili', 'youtube', 'archive'] as const;
export type BackendKey = typeof BACKEND_KEYS[number];

export async function searchAllBackends(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled([
    searchBilibili(query),
    searchYoutube(query),
    searchArchive(query),
  ]);
  return results
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
