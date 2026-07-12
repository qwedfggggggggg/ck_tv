import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const cache = new Map<string, { alive: boolean; status: number; timestamp: number }>();
const TTL = 60_000;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ alive: false, error: 'missing url' }, { status: 400 });
  }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < TTL) {
    return NextResponse.json({ alive: cached.alive, status: cached.status });
  }

  try {
    const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const result = { alive: resp.ok, status: resp.status };
    cache.set(url, { ...result, timestamp: Date.now() });
    return NextResponse.json(result);
  } catch {
    const result = { alive: false, status: 0, error: 'timeout or unreachable' };
    cache.set(url, { ...result, timestamp: Date.now() });
    return NextResponse.json(result);
  }
}
