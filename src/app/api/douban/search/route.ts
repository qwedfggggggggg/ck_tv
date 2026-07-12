import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { DoubanItem } from '@/lib/types';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword');

  if (!keyword) {
    return NextResponse.json(
      { error: '缺少必要参数: keyword' },
      { status: 400 }
    );
  }

  const target = `https://www.douban.com/search?q=${encodeURIComponent(keyword)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://www.douban.com/',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  };

  try {
    const response = await fetch(target, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();

    const resultPattern =
      /<div class="result"[^>]*>[\s\S]*?<a\s+href="https?:\/\/movie\.douban\.com\/subject\/(\d+)\/[^"]*"[\s\S]*?<img[^>]+alt="([^"]*)"[\s\S]*?src="([^"]*)"[\s\S]*?(?:<span class="rating_nums">([^<]*)<\/span>)?[\s\S]*?<div class="content">[\s\S]*?<div class="title">[\s\S]*?<a[^>]+class="title-text"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="abstract">([\s\S]*?)<\/div>[\s\S]*?<\/div>/g;

    const items: DoubanItem[] = [];
    let match;

    while ((match = resultPattern.exec(html)) !== null) {
      const id = match[1];
      const alt = match[2];
      const cover = match[3] ? match[3].replace(/^http:/, 'https:') : '';
      const rate = match[4] || '';
      const titleText = match[5]?.replace(/<[^>]+>/g, '').trim() || alt;
      const abstract = match[6] ? match[6].replace(/<[^>]+>/g, ' ').trim() : '';

      const yearMatch = abstract.match(/(\d{4})/);
      const titleYearMatch = titleText.match(/\((\d{4})\)/);
      const year = titleYearMatch?.[1] || yearMatch?.[1] || '';

      const cleanTitle = titleText.replace(/\s*\(\d{4}\)\s*/, '').trim();

      items.push({
        id,
        title: cleanTitle,
        poster: cover,
        rate,
        year,
      });
    }

    if (items.length === 0) {
      const fallbackPattern =
        /<div class="result"[^>]*>[\s\S]*?<a\s+href="(https?:\/\/movie\.douban\.com\/subject\/(\d+)\/)[^"]*"[\s\S]*?<\/a>/g;
      let fallbackMatch;
      while ((fallbackMatch = fallbackPattern.exec(html)) !== null) {
        const id = fallbackMatch[2];
        if (!items.some((i) => i.id === id)) {
          items.push({
            id,
            title: '',
            poster: '',
            rate: '',
            year: '',
          });
        }
      }
    }

    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { code: 200, message: '获取成功', list: items },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    clearTimeout(timeoutId);
    return NextResponse.json(
      {
        error: '搜索豆瓣数据失败',
        details: (error as Error).message,
        list: [],
      },
      { status: 500 }
    );
  }
}
