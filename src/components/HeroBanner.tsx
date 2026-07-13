'use client';

import { useEffect, useState } from 'react';

import { getAllFavorites, getAllPlayRecords } from '@/lib/db.client';
import type { PlayRecord } from '@/lib/db.client';

interface HeroItem {
  key: string;
  title: string;
  poster?: string;
  year?: string;
  source?: string;
  source_name?: string;
  episodes?: number;
  currentEpisode?: number;
  progress?: number;
  type?: string;
}

export default function HeroBanner() {
  const [items, setItems] = useState<HeroItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const records = await getAllPlayRecords();
        const entries = Object.entries(records as Record<string, PlayRecord>)
          .sort(([, a], [, b]) => b.save_time - a.save_time)
          .slice(0, 5)
          .map(([key, r]) => {
            const [source, id] = key.split('+');
            const progress = r.total_time > 0 ? (r.play_time / r.total_time) * 100 : 0;
            return {
              key, title: r.title, poster: r.cover, year: r.year,
              source, source_name: r.source_name, episodes: r.total_episodes,
              currentEpisode: r.index, progress, type: r.total_episodes > 1 ? 'tv' : 'movie',
            };
          });

        if (entries.length > 0) {
          setItems(entries);
        } else {
          const favs = await getAllFavorites();
          const favEntries = Object.entries(favs as Record<string, any>)
            .sort(([, a], [, b]) => b.save_time - a.save_time)
            .slice(0, 5)
            .map(([key, f]) => {
              const [source, id] = key.split('+');
              return {
                key, title: f.title, poster: f.cover, year: f.year,
                source, source_name: f.source_name, episodes: f.total_episodes,
                type: f.total_episodes > 1 ? 'tv' : 'movie',
              };
            });
          if (favEntries.length > 0) setItems(favEntries);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % items.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (loading || items.length === 0) {
    return (
      <div
        className='relative w-full overflow-hidden'
        style={{
          height: 240,
          background: 'linear-gradient(135deg, #2d1b69, #1a1a2e)',
        }}
      >
        <div
          className='absolute inset-0'
          style={{
            background: 'linear-gradient(to bottom, transparent 40%, var(--sytv-bg))',
          }}
        />
        <div className='relative z-10 h-full flex items-end p-6'>
          <div>
            <div
              className='text-xs px-2 py-0.5 rounded-full inline-block mb-2'
              style={{
                background: 'linear-gradient(135deg, var(--sytv-gradient-1), var(--sytv-gradient-2))',
              }}
            >
              {items.length === 0 ? '🔥 今日推荐' : '📺 继续观看'}
            </div>
            <div className='text-2xl font-bold mb-1' style={{ color: '#fff' }}>
              {items.length === 0 ? '欢迎来到 SYTV' : '加载中...'}
            </div>
            <div className='text-sm' style={{ color: 'var(--sytv-text-secondary)' }}>
              {items.length === 0 ? '搜索你想看的影视内容' : ''}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const item = items[currentIndex];

  return (
    <div
      className='relative w-full overflow-hidden'
      style={{
        height: 240,
        background: 'linear-gradient(135deg, #2d1b69, #1a1a2e)',
      }}
    >
      {/* 渐变遮罩 */}
      <div
        className='absolute inset-0'
        style={{
          background: 'linear-gradient(to bottom, transparent 40%, var(--sytv-bg))',
        }}
      />

      {/* 内容 */}
      <div className='relative z-10 h-full flex items-end p-6'>
        <div className='flex-1'>
          <div
            className='text-xs px-2 py-0.5 rounded-full inline-block mb-2'
            style={{
              background: 'linear-gradient(135deg, var(--sytv-gradient-1), var(--sytv-gradient-2))',
            }}
          >
            {item.progress !== undefined ? '📺 继续观看' : '❤️ 我的收藏'}
          </div>
          <div className='text-2xl font-bold mb-1'>{item.title}</div>
          <div className='text-sm mb-3' style={{ color: 'var(--sytv-text-secondary)' }}>
            {item.year}
            {item.currentEpisode !== undefined && ` · 已观看至 第${item.currentEpisode}集`}
          </div>
          <div className='flex items-center gap-3'>
            <a
              href={`/play?title=${encodeURIComponent(item.title)}&year=${item.year || ''}&source=${item.source || ''}&id=${(item.key || '').split('+')[1] || ''}&stype=${item.type || ''}`}
              className='inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90'
              style={{
                background: 'var(--sytv-gradient)',
                color: '#fff',
              }}
            >
              ▶ 继续播放
            </a>
          </div>
        </div>
      </div>

      {/* 指示点 */}
      {items.length > 1 && (
        <div className='absolute bottom-3 right-4 flex gap-1.5 z-10'>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className='h-1.5 rounded-full transition-all'
              style={{
                width: i === currentIndex ? 16 : 4,
                background: i === currentIndex
                  ? 'linear-gradient(90deg, var(--sytv-gradient-1), var(--sytv-gradient-2))'
                  : '#555',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
