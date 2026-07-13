/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { ChevronUp, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { groupSimilar } from '@/lib/similarity';
import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

function SearchPageClient() {
  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fallbackLabel, setFallbackLabel] = useState<string | null>(null);

  const aggregatedResults = useMemo(() => {
    if (!searchResults.length) return [];
    const groups = groupSimilar(searchResults, { threshold: 0.85 });

    const withSources = groups.map((group) => {
      const allSourceNames = group.map((r) => r.source_name).filter(Boolean);
      const best = group.reduce((a, b) => {
        const scoreA =
          ((a.episodes?.length ?? 0) > 0 ? 1 : 0) +
          (a.poster ? 1 : 0) +
          (a.year && a.year !== 'unknown' ? 1 : 0);
        const scoreB =
          ((b.episodes?.length ?? 0) > 0 ? 1 : 0) +
          (b.poster ? 1 : 0) +
          (b.year && b.year !== 'unknown' ? 1 : 0);
        return scoreB > scoreA ? b : a;
      });
      return { best: { ...best, allSourceNames } as SearchResult & { allSourceNames: string[] }, group };
    });

    withSources.sort((a, b) => {
      const aCount = a.best.allSourceNames?.length ?? 1;
      const bCount = b.best.allSourceNames?.length ?? 1;
      if (bCount !== aCount) return bCount - aCount;
      const aHasYear = a.best.year && a.best.year !== 'unknown' ? 1 : 0;
      const bHasYear = b.best.year && b.best.year !== 'unknown' ? 1 : 0;
      if (bHasYear !== aHasYear) return bHasYear - aHasYear;
      const aHasPoster = a.best.poster ? 1 : 0;
      const bHasPoster = b.best.poster ? 1 : 0;
      if (bHasPoster !== aHasPoster) return bHasPoster - aHasPoster;
      const aHasEps = (a.best.episodes?.length ?? 0) > 0 ? 1 : 0;
      const bHasEps = (b.best.episodes?.length ?? 0) > 0 ? 1 : 0;
      if (bHasEps !== aHasEps) return bHasEps - aHasEps;
      return 0;
    });

    return withSources.map(({ best, group }) => [best.title, group] as [string, SearchResult[]]);
  }, [searchResults]);

  useEffect(() => {
    // 无搜索参数时聚焦搜索框
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    // 初始加载搜索历史
    getSearchHistory().then(setSearchHistory);

    // 监听搜索历史更新事件
    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    // 获取滚动位置的函数 - 专门针对 body 滚动
    const getScrollTop = () => {
      return document.body.scrollTop || 0;
    };

    // 使用 requestAnimationFrame 持续检测滚动位置
    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;

      const scrollTop = getScrollTop();
      const shouldShow = scrollTop > 300;
      setShowBackToTop(shouldShow);

      requestAnimationFrame(checkScrollPosition);
    };

    // 启动持续检测
    isRunning = true;
    checkScrollPosition();

    // 监听 body 元素的滚动事件
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      unsubscribe();
      isRunning = false; // 停止 requestAnimationFrame 循环

      // 移除 body 滚动事件监听器
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    // 当搜索参数变化时更新搜索状态
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      fetchSearchResults(query);

      // 保存到搜索历史 (事件监听会自动更新界面)
      addSearchHistory(query);
    } else {
      setShowResults(false);
    }
  }, [searchParams]);

  const enrichedTitles = useRef(new Set<string>());

  useEffect(() => {
    if (!searchResults.length) return;
    const missing = searchResults.filter(r => !r.douban_id && r.douban_id !== 0);
    if (!missing.length) return;

    const unique = new Map<string, SearchResult>();
    missing.forEach(r => {
      const key = r.title.toLowerCase().trim();
      if (!enrichedTitles.current.has(key)) {
        unique.set(key, r);
      }
    });
    if (!unique.size) return;

    for (const result of Array.from(unique.values())) {
      const key = result.title.toLowerCase().trim();
      enrichedTitles.current.add(key);
      fetch(`/api/douban/search?keyword=${encodeURIComponent(result.title)}`)
        .then(r => r.json())
        .then(data => {
          if (data.list?.length) {
            const match = result.year && result.year !== 'unknown'
              ? data.list.find((i: any) => i.year === result.year)
              : null;
            const found = match || data.list[0];
            if (found?.id) {
              setSearchResults(prev => prev.map(r =>
                r.title.toLowerCase().trim() === key && !r.douban_id && r.douban_id !== 0
                  ? { ...r, douban_id: parseInt(found.id) }
                  : r
              ));
            }
          }
        })
        .catch(() => { /* background enrichment - fail silently */ });
    }
  }, [searchResults]);

  async function fetchWithFallback(query: string): Promise<{ results: SearchResult[]; fallbackLabel: string | null; hasMore: boolean }> {
    const trimmed = query.trim();
    const attempts: { q: string; label: string }[] = [{ q: trimmed, label: trimmed }];

    const yearMatch = trimmed.match(/^(.+?)\s*(19\d\d|20\d\d)$/);
    if (yearMatch) {
      attempts.push({ q: yearMatch[1].trim(), label: `去除年份"${yearMatch[2]}"的模糊搜索` });
    }

    const subtypeKeywords = ['动漫', '动画', '电影', '电视剧', '综艺', '纪录片'];
    for (const kw of subtypeKeywords) {
      if (trimmed.includes(kw)) {
        attempts.push({ q: trimmed.replace(kw, '').trim(), label: `去除分类"${kw}"的模糊搜索` });
        break;
      }
    }

    if (trimmed.length > 3) {
      attempts.push({ q: trimmed.slice(0, -1), label: `尝试模糊搜索"${trimmed.slice(0, -1)}"` });
    }

    for (const attempt of attempts) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(attempt.q)}&batch=1`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await resp.json();
        if (data.results?.length > 0) {
          const isFallback = attempt.label !== trimmed;
          return { results: data.results, fallbackLabel: isFallback ? attempt.label : null, hasMore: data.hasMore ?? false };
        }
      } catch { clearTimeout(timeoutId); /* continue */ }
    }

    return { results: [], fallbackLabel: null, hasMore: false };
  }

  const fetchSearchResults = async (query: string) => {
    try {
      setSearchError(null);
      setIsLoading(true);
      setFallbackLabel(null);
      const { results: rawResults, fallbackLabel: fbLabel, hasMore } = await fetchWithFallback(query);
      const results = rawResults;
      setSearchResults(
        results.sort((a: SearchResult, b: SearchResult) => {
          // 优先排序：标题与搜索词完全一致的排在前面
          const aExactMatch = a.title === query.trim();
          const bExactMatch = b.title === query.trim();

          if (aExactMatch && !bExactMatch) return -1;
          if (!aExactMatch && bExactMatch) return 1;

          // 如果都匹配或都不匹配，则按原来的逻辑排序
          if (a.year === b.year) {
            return a.title.localeCompare(b.title);
          } else {
            // 处理 unknown 的情况
            if (a.year === 'unknown' && b.year === 'unknown') {
              return 0;
            } else if (a.year === 'unknown') {
              return 1; // a 排在后面
            } else if (b.year === 'unknown') {
              return -1; // b 排在后面
            } else {
              // 都是数字年份，按数字大小排序（大的在前面）
              return parseInt(a.year) > parseInt(b.year) ? -1 : 1;
            }
          }
        })
      );
      setFallbackLabel(fbLabel);
      setShowResults(true);
      sessionStorage.setItem('cktv_sr_' + query, JSON.stringify(results));

      // Progressive remaining batches
      if (hasMore) {
        let batch = 2;
        let more = true;
        while (more) {
          try {
            const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&batch=${batch}`, {
              signal: AbortSignal.timeout(10000),
            });
            const data = await resp.json();
            if (data.results?.length) {
              setSearchResults(prev => [...prev, ...data.results]);
            }
            more = data.hasMore;
            batch++;
          } catch { break; }
        }
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError('搜索失败，请检查网络后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    // 回显搜索框
    setSearchQuery(trimmed);
    setIsLoading(true);
    setShowResults(true);

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    // 保存到搜索历史 (事件监听会自动更新界面)
    addSearchHistory(trimmed);
  };

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据调试结果，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        {/* 搜索框 */}
        <div className='mb-8'>
          <form onSubmit={handleSearch} className='max-w-2xl mx-auto'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
              <input
                id='searchInput'
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='搜索电影、电视剧...'
                className='w-full h-12 rounded-lg bg-gray-50/80 py-3 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:bg-white border border-gray-200/50 shadow-sm dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-700 dark:border-gray-700'
              />
            </div>
          </form>
        </div>

        {/* 搜索结果或搜索历史 */}
        <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
          {isLoading ? (
            <div className='flex justify-center items-center h-40'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
            </div>
          ) : showResults ? (
            <section className='mb-12'>
              <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200 mb-8'>
                搜索结果
              </h2>
              {fallbackLabel && (
                <p className='text-sm text-amber-600 dark:text-amber-400 mb-6 -mt-4'>
                  未找到精确匹配，{fallbackLabel}
                </p>
              )}
              <div
                className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-5 lg:gap-x-6 2xl:gap-x-8'
              >
                {aggregatedResults.map(([mapKey, group]) => (
                  <div key={`agg-${mapKey}`} className='w-full'>
                    <VideoCard
                      from='search'
                      items={group}
                      query={
                        searchQuery.trim() !== group[0].title
                          ? searchQuery.trim()
                          : ''
                      }
                    />
                  </div>
                ))}
                {searchError && (
                  <div className='col-span-full text-center text-red-500 py-8'>
                    {searchError}
                  </div>
                )}
                {searchResults.length === 0 && !searchError && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                    未找到相关结果
                  </div>
                )}
              </div>
            </section>
          ) : searchHistory.length > 0 ? (
            // 搜索历史
            <section className='mb-12'>
              <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                搜索历史
                {searchHistory.length > 0 && (
                  <button
                    onClick={() => {
                      clearSearchHistory(); // 事件监听会自动更新界面
                    }}
                    className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                  >
                    清空
                  </button>
                )}
              </h2>
              <div className='flex flex-wrap gap-2'>
                {searchHistory.map((item) => (
                  <div key={item} className='relative group'>
                    <button
                      onClick={() => {
                        setSearchQuery(item);
                        router.push(
                          `/search?q=${encodeURIComponent(item.trim())}`
                        );
                      }}
                      className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                    >
                      {item}
                    </button>
                    {/* 删除按钮 */}
                    <button
                      aria-label='删除搜索历史'
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteSearchHistory(item); // 事件监听会自动更新界面
                      }}
                      className='absolute -top-1 -right-1 w-4 h-4 opacity-0 group-hover:opacity-100 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                    >
                      <X className='w-3 h-3' />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            // 没有搜索历史，也没有活动搜索
            <div className='col-span-full text-center text-gray-400 py-16 dark:text-gray-500'>
              <Search className='w-12 h-12 mx-auto mb-4 opacity-30' />
              <p className='text-lg'>搜索你想看的电影或电视剧</p>
              <p className='text-sm mt-2'>支持多资源站聚合搜索</p>
            </div>
          )}
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <SearchPageClient />
    </Suspense>
  );
}
