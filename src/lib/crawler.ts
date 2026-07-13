import { SearchResult } from '@/lib/types';

const CRAWLER_TIMEOUT_MS = 4000;

interface CrawlerConfig {
  key: string;
  name: string;
  searchUrl: string;
  extract: (html: string) => SearchResult[];
}

const CRAWLER_SOURCES: CrawlerConfig[] = [
  {
    key: 'crawler_tmdb',
    name: 'TMDB',
    searchUrl: 'https://www.themoviedb.org/search/movie?query={q}',
    extract: extractTMDB,
  },
];

function extractTMDB(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const cards = html.split('class="comp:media-card');
  if (cards.length < 2) return results;

  for (const card of cards.slice(1)) {
    const hrefMatch = card.match(/href="(\/movie\/\d+[^"]*)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];

    const titleMatch = card.match(/<span>([^<]+)<\/span>/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();

    const yearMatch = card.match(/release_date[^]{0,50}?(\d{4})/);
    const year = yearMatch ? yearMatch[1] : '';

    const posterMatch = card.match(/https:\/\/media\.themoviedb\.org[^\s"'&]+(?:jpg|png|webp)/);
    const poster = posterMatch ? posterMatch[0].replace(/w94_and_h141_face/, 'w300_and_h450_face') : '';

    const id = href.replace('/movie/', '');
    results.push({
      id: id || href,
      title,
      poster,
      episodes: [{ name: '详情', url: `https://www.themoviedb.org${href}` }],
      source: 'crawler_tmdb',
      source_name: 'TMDB',
      desc: '',
      year,
    });
  }
  return results;
}

export async function searchFromCrawler(source: CrawlerConfig, query: string): Promise<SearchResult[]> {
  try {
    const url = source.searchUrl.replace('{q}', encodeURIComponent(query));
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(CRAWLER_TIMEOUT_MS),
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    const items = source.extract(html);
    return items.map(i => ({ ...i, source: source.key, source_name: source.name }));
  } catch {
    return [];
  }
}

export async function searchAllCrawlers(query: string): Promise<SearchResult[]> {
  const promises = CRAWLER_SOURCES.map(s => searchFromCrawler(s, query));
  const settled = await Promise.allSettled(promises);
  return settled
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
