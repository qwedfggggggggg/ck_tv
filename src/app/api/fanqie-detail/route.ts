import { NextResponse } from 'next/server';

import { getFanqieDetail } from '@/lib/backends';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get('book_id');

  if (!bookId || !/^[\w]+$/.test(bookId)) {
    return NextResponse.json({ error: '缺少 book_id 参数' }, { status: 400 });
  }

  try {
    const result = await getFanqieDetail(bookId);
    if (!result) {
      return NextResponse.json({ error: '获取详情失败' }, { status: 404 });
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=600, s-maxage=600',
        'CDN-Cache-Control': 'public, s-maxage=600',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=600',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
