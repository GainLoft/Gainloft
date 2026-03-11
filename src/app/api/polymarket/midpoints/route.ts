import { NextResponse } from 'next/server';
import { fetchLivePrices } from '@/lib/polymarket';

export const preferredRegion = 'sin1';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tokenIds: string[] = Array.isArray(body) ? body : [];

    if (!tokenIds.length) {
      return NextResponse.json({}, { status: 400 });
    }

    const prices = await fetchLivePrices(tokenIds);
    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    console.error('Live prices fetch error:', err);
    return NextResponse.json({}, { status: 500 });
  }
}
