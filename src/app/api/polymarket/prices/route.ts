import { NextResponse } from 'next/server';
import { fetchPriceHistory } from '@/lib/polymarket';

export const preferredRegion = 'sin1';

const PERIOD_MAP: Record<string, { interval: string; fidelity: number }> = {
  '1h':  { interval: '1h',  fidelity: 1 },
  '6h':  { interval: '6h',  fidelity: 5 },
  '1d':  { interval: '1d',  fidelity: 15 },
  '1w':  { interval: '1w',  fidelity: 60 },
  '1m':  { interval: '1m',  fidelity: 360 },
  'all': { interval: 'max', fidelity: 1440 },
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenId = url.searchParams.get('token_id');
  const period = url.searchParams.get('period') || '1w';

  if (!tokenId) {
    return NextResponse.json({ error: 'token_id required' }, { status: 400 });
  }

  const config = PERIOD_MAP[period] || PERIOD_MAP['1w'];

  try {
    const history = await fetchPriceHistory(tokenId, config.interval, config.fidelity);
    return NextResponse.json(history, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('Price history fetch error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
