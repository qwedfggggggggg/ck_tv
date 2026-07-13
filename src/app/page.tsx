/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import HeroBanner from '@/components/HeroBanner';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import VideoCard from '@/components/VideoCard';

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    const fetchDoubanData = async () => {
      try {
        setLoading(true);

        const [moviesData, tvShowsData, varietyShowsData] = await Promise.all([
          getDoubanCategories({ kind: 'movie', category: '热门', type: '全部' }),
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
        ]);

        if (moviesData.code === 200) setHotMovies(moviesData.list);
        if (tvShowsData.code === 200) setHotTvShows(tvShowsData.list);
        if (varietyShowsData.code === 200) setHotVarietyShows(varietyShowsData.list);
      } catch {
        setError('获取推荐数据失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };
    fetchDoubanData();
  }, []);

  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);
        const playRecord = allPlayRecords[key];
        return {
          id, source, title: fav.title, year: fav.year, poster: fav.cover,
          episodes: fav.total_episodes, source_name: fav.source_name,
          currentEpisode: playRecord?.index, search_title: fav?.search_title,
        } as FavoriteItem;
      });
    setFavoriteItems(sorted);
  };

  useEffect(() => {
    if (activeTab !== 'favorites') return;
    const loadFavorites = async () => {
      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);
    };
    loadFavorites();
    const unsubscribe = subscribeToDataUpdates('favoritesUpdated', (newFavorites: Record<string, any>) => {
      updateFavoriteItems(newFavorites);
    });
    return unsubscribe;
  }, [activeTab]);

  const SectionHeader = ({ title, href }: { title: string; href?: string }) => (
    <div className='flex items-center justify-between mb-3'>
      <h2 className='text-base font-bold' style={{ color: '#e8e8e8' }}>{title}</h2>
      {href && (
        <Link href={href} className='flex items-center text-xs gap-0.5' style={{ color: 'var(--sytv-text-secondary)' }}>
          更多 <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );

  const SkeletonCard = () => (
    <div className='min-w-[96px] w-24 sm:min-w-[160px] sm:w-40'>
      <div className='aspect-[2/3] w-full rounded-lg animate-pulse' style={{ background: '#2a2a2a' }} />
    </div>
  );

  return (
    <PageLayout>
      {activeTab === 'home' ? (
        <>
          <HeroBanner />

          <div className='px-3 sm:px-6 py-4 max-w-screen-2xl mx-auto'>
            {error && (
              <div className='mb-4 px-4 py-3 rounded-lg text-sm' style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                {error}
              </div>
            )}

            {/* Tab切换 */}
            <div className='mb-4 flex justify-center'>
              <CapsuleSwitch
                options={[
                  { label: '首页', value: 'home' },
                  { label: '收藏夹', value: 'favorites' },
                ]}
                active={activeTab}
                onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
              />
            </div>

            {/* 继续观看 */}
            <ContinueWatching />

            {/* 热门推荐（电影） */}
            <section className='mb-6'>
              <SectionHeader title='🔥 热门推荐' href='/douban?type=movie' />
              <ScrollableRow>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
                  : hotMovies.map((movie, i) => (
                    <div key={i} className='min-w-[96px] w-24 sm:min-w-[160px] sm:w-40'>
                      <VideoCard from='douban' title={movie.title} poster={movie.poster}
                        douban_id={movie.id} rate={movie.rate} year={movie.year} type='movie' />
                    </div>
                  ))}
              </ScrollableRow>
            </section>

            {/* 热播剧集 */}
            <section className='mb-6'>
              <SectionHeader title='📺 热播剧集' href='/douban?type=tv' />
              {/* 地区筛选tab */}
              <div className='flex gap-2 mb-3 overflow-x-auto scrollbar-hide'>
                {['全部', '国产', '欧美', '日韩'].map((region) => (
                  <Link
                    key={region}
                    href={region === '全部' ? '/douban?type=tv' : `/douban?type=tv&sub=tv_${region === '国产' ? 'domestic' : region === '欧美' ? 'american' : region === '日本' ? 'japanese' : 'korean'}`}
                    className='text-xs px-3 py-1 rounded-full transition-colors whitespace-nowrap'
                    style={{
                      background: region === '全部' ? 'linear-gradient(135deg, var(--sytv-gradient-1), var(--sytv-gradient-2))' : '#2a2a2a',
                      color: region === '全部' ? '#fff' : 'var(--sytv-text-secondary)',
                    }}
                  >
                    {region}
                  </Link>
                ))}
              </div>
              <ScrollableRow>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
                  : hotTvShows.map((show, i) => (
                    <div key={i} className='min-w-[96px] w-24 sm:min-w-[160px] sm:w-40'>
                      <VideoCard from='douban' title={show.title} poster={show.poster}
                        douban_id={show.id} rate={show.rate} year={show.year} />
                    </div>
                  ))}
              </ScrollableRow>
            </section>

            {/* 热门综艺 */}
            <section className='mb-6'>
              <SectionHeader title='🎭 热门综艺' href='/douban?type=show' />
              <ScrollableRow>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
                  : hotVarietyShows.map((show, i) => (
                    <div key={i} className='min-w-[96px] w-24 sm:min-w-[160px] sm:w-40'>
                      <VideoCard from='douban' title={show.title} poster={show.poster}
                        douban_id={show.id} rate={show.rate} year={show.year} />
                    </div>
                  ))}
              </ScrollableRow>
            </section>

            {/* B站精选 */}
            <section className='mb-6'>
              <SectionHeader title='⚡ B站精选' href='/bilibili' />
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Link key={i} href='/bilibili' className='block rounded-lg overflow-hidden transition-transform hover:scale-[1.02]'
                    style={{ background: '#2a2a2a' }}>
                    <div className='aspect-video flex items-center justify-center' style={{ background: '#333' }}>
                      <span className='text-2xl opacity-30'>▶</span>
                    </div>
                    <div className='p-2'>
                      <div className='h-3 rounded mb-1' style={{ background: '#3a3a3a', width: '80%' }} />
                      <div className='text-xs' style={{ color: 'var(--sytv-text-secondary)' }}>B站精选内容</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : (
        // 收藏夹视图
        <div className='px-3 sm:px-6 py-4 max-w-screen-2xl mx-auto'>
          <div className='mb-4 flex justify-center'>
            <CapsuleSwitch
              options={[
                { label: '首页', value: 'home' },
                { label: '收藏夹', value: 'favorites' },
              ]}
              active={activeTab}
              onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
            />
          </div>
          <section>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-base font-bold' style={{ color: '#e8e8e8' }}>我的收藏</h2>
              {favoriteItems.length > 0 && (
                <button
                  className='text-xs' style={{ color: 'var(--sytv-text-secondary)' }}
                  onClick={async () => { await clearAllFavorites(); setFavoriteItems([]); }}
                >
                  清空
                </button>
              )}
            </div>
            <div className='grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-6'>
              {favoriteItems.map((item) => (
                <div key={item.id + item.source} className='w-full'>
                  <VideoCard query={item.search_title} {...item} from='favorite' type={item.episodes > 1 ? 'tv' : ''} />
                </div>
              ))}
              {favoriteItems.length === 0 && (
                <div className='col-span-full text-center py-8' style={{ color: 'var(--sytv-text-secondary)' }}>
                  暂无收藏内容
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className='flex items-center justify-center min-h-screen' style={{ background: 'var(--sytv-bg)' }}>
        <div className='w-8 h-8 rounded-full animate-spin' style={{
          border: '3px solid rgba(139,92,246,0.2)',
          borderTopColor: '#8b5cf6',
        }} />
      </div>
    }>
      <HomeClient />
    </Suspense>
  );
}
