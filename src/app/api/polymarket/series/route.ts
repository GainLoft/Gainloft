import { NextResponse } from 'next/server';

/**
 * Returns active recurring series for display on browse pages.
 * Uses computed event slugs + gamma API to avoid downloading 10MB+ series responses.
 *
 * Query params:
 *   tag - category tag slug (e.g., "crypto")
 *   limit - max results (default 20)
 */

interface SeriesConfig {
  seriesSlug: string;
  slugPrefix: string;
  title: string;
  recurrence: string;
  image: string;
}

interface SeriesCard {
  seriesSlug: string;
  seriesTitle: string;
  recurrence: string;
  volume24hr: number;
  liquidity: number;
  image: string;
  eventSlug: string;
  eventTitle: string;
  eventEndDate: string;
  startTime: string | null;
  outcomes: string[];
  prices: number[];
  tokenIds: string[];
  tags: { slug: string; label: string }[];
}

// Known series per category tag
const SERIES_BY_TAG: Record<string, SeriesConfig[]> = {
  crypto: [
    { seriesSlug: 'btc-up-or-down-5m', slugPrefix: 'btc-updown-5m', title: 'BTC Up or Down', recurrence: '5m', image: 'https://polymarket-upload.s3.us-east-2.amazonaws.com/BTC+fullsize.png' },
    { seriesSlug: 'eth-up-or-down-5m', slugPrefix: 'eth-updown-5m', title: 'ETH Up or Down', recurrence: '5m', image: 'https://polymarket-upload.s3.us-east-2.amazonaws.com/ETH+fullsize.jpg' },
    { seriesSlug: 'sol-up-or-down-5m', slugPrefix: 'sol-updown-5m', title: 'SOL Up or Down', recurrence: '5m', image: 'https://polymarket-upload.s3.us-east-2.amazonaws.com/SOL+fullsize.png' },
    { seriesSlug: 'xrp-up-or-down-5m', slugPrefix: 'xrp-updown-5m', title: 'XRP Up or Down', recurrence: '5m', image: 'https://polymarket-upload.s3.us-east-2.amazonaws.com/XRP-logo.png' },
  ],
};

// Compute the current slot timestamp for a given recurrence
function getCurrentSlotTs(recurrence: string): number {
  const now = Math.floor(Date.now() / 1000);
  switch (recurrence) {
    case '5m': return Math.floor(now / 300) * 300;
    case '15m': return Math.floor(now / 900) * 900;
    case '1h': case 'hourly': return Math.floor(now / 3600) * 3600;
    case '4h': return Math.floor(now / 14400) * 14400;
    default: return Math.floor(now / 300) * 300;
  }
}

// Interval in seconds for each recurrence
function getIntervalSecs(recurrence: string): number {
  switch (recurrence) {
    case '5m': return 300;
    case '15m': return 900;
    case '1h': case 'hourly': return 3600;
    case '4h': return 14400;
    default: return 300;
  }
}

// Parse a field that might be a JSON string or already parsed
function parseField<T>(val: unknown): T {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val as T; }
  }
  return val as T;
}

// Fetch a single event by slug from gamma API
async function fetchEvent(slug: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

// Cache
const cache: Record<string, { data: SeriesCard[]; ts: number }> = {};
const CACHE_TTL = 30_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tag = url.searchParams.get('tag') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  const cacheKey = `${tag}:${limit}`;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL) {
    return NextResponse.json(cache[cacheKey].data, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  }

  const configs = SERIES_BY_TAG[tag];
  if (!configs || configs.length === 0) {
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  }

  try {
    // Fetch current event for each series in parallel
    const results = await Promise.all(
      configs.slice(0, limit).map(async (config) => {
        const slotTs = getCurrentSlotTs(config.recurrence);
        const interval = getIntervalSecs(config.recurrence);

        // Try current slot, then previous slot as fallback
        let event = await fetchEvent(`${config.slugPrefix}-${slotTs}`);
        if (!event) {
          event = await fetchEvent(`${config.slugPrefix}-${slotTs - interval}`);
        }
        if (!event) {
          event = await fetchEvent(`${config.slugPrefix}-${slotTs + interval}`);
        }

        return { config, event };
      })
    );

    const cards: SeriesCard[] = [];

    for (const { config, event } of results) {
      if (!event) continue;

      const markets = event.markets as Record<string, unknown>[] | undefined;
      const market = markets?.[0];
      if (!market) continue;

      // Get series-level volume from the series array in the response
      const seriesArr = event.series as { slug: string; volume24hr: number; recurrence: string }[] | undefined;
      const seriesMeta = seriesArr?.find(s => s.slug === config.seriesSlug);

      const outcomes = parseField<string[]>(market.outcomes) || ['Up', 'Down'];
      const prices = (parseField<string[]>(market.outcomePrices) || []).map(Number);
      const tokenIds = parseField<string[]>(market.clobTokenIds) || [];

      // Build title from API data: "Bitcoin Up or Down - March 10, ..." → "Bitcoin Up or Down - 5 Minutes"
      const RECURRENCE_LABEL: Record<string, string> = { '5m': '5 Minutes', '15m': '15 Minutes', '1h': 'Hourly', hourly: 'Hourly', '4h': '4 Hours', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
      const eventTitle = (event.title as string) || '';
      const assetMatch = eventTitle.match(/^(.+?)\s+Up or Down/i);
      const assetName = assetMatch ? assetMatch[1] : config.title.replace(' Up or Down', '');
      const rec = seriesMeta?.recurrence || config.recurrence;
      const recLabel = RECURRENCE_LABEL[rec] || rec;
      const displayTitle = `${assetName} Up or Down - ${recLabel}`;

      cards.push({
        seriesSlug: config.seriesSlug,
        seriesTitle: displayTitle,
        recurrence: seriesMeta?.recurrence || config.recurrence,
        volume24hr: seriesMeta?.volume24hr || 0,
        liquidity: (event.liquidity as number) || 0,
        image: config.image || (event.image as string) || '',
        eventSlug: event.slug as string,
        eventTitle: event.title as string,
        eventEndDate: event.endDate as string,
        startTime: (event.startTime as string) || null,
        outcomes,
        prices,
        tokenIds,
        tags: ((event.tags || []) as { slug: string; label: string }[])
          .map(t => ({ slug: t.slug, label: t.label })),
      });
    }

    // Sort by volume descending
    cards.sort((a, b) => b.volume24hr - a.volume24hr);

    cache[cacheKey] = { data: cards, ts: Date.now() };

    return NextResponse.json(cards, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('Series fetch error:', err);
    return NextResponse.json([], { status: 200 });
  }
}
