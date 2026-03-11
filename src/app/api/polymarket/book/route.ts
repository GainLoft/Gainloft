import { NextResponse } from 'next/server';

export const preferredRegion = 'sin1';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenId = url.searchParams.get('token_id');

  if (!tokenId) {
    return NextResponse.json({ error: 'token_id required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      return NextResponse.json({ bids: [], asks: [] }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=2' },
    });
  } catch {
    return NextResponse.json({ bids: [], asks: [] }, { status: 200 });
  }
}
