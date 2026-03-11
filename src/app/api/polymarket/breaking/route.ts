import { NextResponse } from 'next/server';

export const preferredRegion = 'sin1';

/**
 * Proxies Polymarket's /api/biggest-movers endpoint directly.
 * This is the actual data source for their Breaking News page —
 * sorted by absolute 24h price change, with sparkline history included.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category') || undefined;

  try {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);

    const apiUrl = `https://polymarket.com/api/biggest-movers${params.toString() ? `?${params}` : ''}`;
    const res = await fetch(apiUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);

    const data = await res.json();

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('Breaking fetch error:', err);
    return NextResponse.json({ markets: [] }, { status: 500 });
  }
}
