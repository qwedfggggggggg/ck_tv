import { NextRequest, NextResponse } from 'next/server';
import { recordSearchResult } from '@/lib/dead-source-cache';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { key: string; success: boolean };
    if (body && body.key) {
      recordSearchResult(body.key, body.success ?? false);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
