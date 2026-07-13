/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

import { searchBilibili } from '@/lib/backends';
import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';

const TRENDING_QUERIES = ['热门视频', '影视解说', '电影解说', '动漫', '纪录片', '科技'];

function BilibiliClient() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (q: string) => {
    const searchQuery = q.trim();
    if (!searchQuery) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchBilibili(searchQuery);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout>
      <div className='max-w-screen-xl mx-auto px-3 sm:px-6 py-6'>
        {/* 标题 */}
        <div className='mb-6'>
          <h1 className='text-xl font-bold mb-1' style={{ color: '#e8e8e8' }}>
            <span style={{ color: '#e6567a' }}>●</span> B站短视频
          </h1>
          <p className='text-sm' style={{ color: 'var(--sytv-text-secondary)' }}>
            搜索哔哩哔哩/B站视频内容
          </p>
        </div>

        {/* 搜索框 */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(query); }}
          className='mb-6'
        >
          <div className='flex gap-2'>
            <div className='flex-1 flex items-center rounded-lg px-4 h-10' style={{ background: '#2a2a2a' }}>
              <Search size={16} style={{ color: 'var(--sytv-text-secondary)', marginRight: 8 }} />
              <input
                type='text'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='搜索B站视频...'
                className='bg-transparent border-none outline-none text-sm flex-1'
                style={{ color: '#ccc' }}
              />
            </div>
            <button
              type='submit'
              className='px-5 h-10 rounded-lg text-sm font-semibold text-white'
              style={{ background: 'var(--sytv-gradient)' }}
            >
              搜索
            </button>
          </div>
        </form>

        {/* 热门推荐 */}
        {!searched && (
          <div className='mb-6'>
            <p className='text-sm mb-3' style={{ color: 'var(--sytv-text-secondary)' }}>试试搜索这些：</p>
            <div className='flex flex-wrap gap-2'>
              {TRENDING_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => { setQuery(q); handleSearch(q); }}
                  className='px-3 py-1.5 rounded-full text-sm transition-colors'
                  style={{ background: '#2a2a2a', color: '#ccc' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 结果网格 */}
        {searched && (
          <>
            {loading ? (
              <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className='animate-pulse rounded-lg overflow-hidden' style={{ background: '#2a2a2a' }}>
                    <div className='aspect-video' style={{ background: '#333' }} />
                    <div className='p-3'>
                      <div className='h-3 rounded mb-2' style={{ background: '#3a3a3a', width: '90%' }} />
                      <div className='h-3 rounded' style={{ background: '#3a3a3a', width: '60%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length > 0 ? (
              <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'>
                {results.map((item) => {
                  const bvid = item.id.replace('bilibili:', '');
                  return (
                    <Link
                      key={item.id}
                      href={`/play?title=${encodeURIComponent(item.title)}&year=${item.year || ''}&source=backend:bilibili&id=${item.id}&stype=video`}
                      className='block rounded-lg overflow-hidden transition-transform hover:scale-[1.02]'
                      style={{ background: '#2a2a2a' }}
                    >
                      <div className='aspect-video overflow-hidden' style={{ background: '#333' }}>
                        {item.poster ? (
                          <img
                            src={item.poster}
                            alt={item.title}
                            className='w-full h-full object-cover'
                            loading='lazy'
                          />
                        ) : (
                          <div className='w-full h-full flex items-center justify-center text-2xl' style={{ color: '#555' }}>▶</div>
                        )}
                      </div>
                      <div className='p-3'>
                        <p className='text-sm font-medium line-clamp-2 mb-1' style={{ color: '#ddd' }}>
                          {item.title}
                        </p>
                        <p className='text-xs' style={{ color: 'var(--sytv-text-secondary)' }}>
                          B站 · {item.year || ''}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className='text-center py-12' style={{ color: 'var(--sytv-text-secondary)' }}>
                未找到相关内容
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default function BilibiliPage() {
  return (
    <Suspense fallback={
      <div className='flex items-center justify-center min-h-screen' style={{ background: 'var(--sytv-bg)' }}>
        <div className='w-8 h-8 rounded-full animate-spin' style={{ border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6' }} />
      </div>
    }>
      <BilibiliClient />
    </Suspense>
  );
}
