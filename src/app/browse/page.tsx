/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Suspense, useEffect, useState } from 'react';

import { SearchResult } from '@/lib/types';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

const CATEGORIES = [
  { label: '全部', value: '' },
  { label: '电影', value: '1' },
  { label: '电视剧', value: '2' },
  { label: '综艺', value: '3' },
  { label: '动漫', value: '4' },
];

interface BrowseItem {
  id: string;
  title: string;
  poster: string;
  episodes: { name: string; url: string }[];
  source: string;
  source_name: string;
  year: string;
  douban_id?: number;
  desc?: string;
  remark?: string;
  all_sources?: { key: string; name: string }[];
}

function BrowseClient() {
  const [activeType, setActiveType] = useState('');
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchItems = async (type: string, pageNum: number) => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/classify?type=${type}&page=${pageNum}`);
      const data = await resp.json();
      if (pageNum === 1) {
        setItems(data.list || []);
      } else {
        setItems(prev => [...prev, ...(data.list || [])]);
      }
      setHasMore(pageNum < (data.pagecount || 1));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchItems(activeType, 1);
  }, [activeType]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchItems(activeType, next);
  };

  return (
    <PageLayout>
      <div className='px-4 sm:px-10 py-4 sm:py-8'>
        <div className='flex gap-2 mb-8 overflow-x-auto'>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setActiveType(cat.value)}
              className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeType === cat.value
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className='grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-5 lg:gap-x-6'>
          {items.map((item, idx) => (
            <VideoCard
              key={`${item.id}-${idx}`}
              from='search'
              items={[item as SearchResult]}
              query={item.title}
            />
          ))}
          {!loading && items.length === 0 && (
            <div className='col-span-full text-center text-gray-500 py-16 dark:text-gray-400'>
              暂无内容
            </div>
          )}
        </div>

        {hasMore && (
          <div className='flex justify-center mt-8'>
            <button
              onClick={loadMore}
              disabled={loading}
              className='px-8 py-2 bg-green-500 text-white rounded-full text-sm hover:bg-green-600 disabled:opacity-50 transition-colors'
            >
              {loading ? '加载中...' : '加载更多'}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" /></div>}>
      <BrowseClient />
    </Suspense>
  );
}
