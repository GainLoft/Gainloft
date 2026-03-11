import { NextResponse } from 'next/server';

/**
 * Direct proxy to Polymarket gamma API — bypasses local DB.
 * Fetches ALL events with full pagination so nothing is missed.
 *
 * Query params:
 *   tag      - Polymarket tag slug (e.g., "crypto", "politics")
 *   limit    - per page (max 100, default 100)
 *   offset   - pagination offset (default 0)
 *   order    - sort field (volume24hr, volume, liquidity, startDate, endDate)
 *   active   - "true" or "false"
 *   closed   - "true" or "false"
 *   search   - title search query
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';

// Simple in-memory cache (per-page)
const cache: Record<string, { data: unknown; ts: number }> = {};
const CACHE_TTL = 15_000; // 15s

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tag = url.searchParams.get('tag') || '';
  const parentTag = url.searchParams.get('parentTag')?.toLowerCase() || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const order = url.searchParams.get('order') || 'volume24hr';
  const active = url.searchParams.get('active');
  const closed = url.searchParams.get('closed');
  const search = url.searchParams.get('search') || '';

  // Build gamma API query
  const sp = new URLSearchParams();
  if (tag) sp.set('tag_slug', tag);
  sp.set('offset', String(offset));

  const TIME_TAGS = new Set(['5m', '15m', 'hourly', '4hour']);
  const isTimeTag = TIME_TAGS.has(tag);
  if (isTimeTag) {
    // Time-based tags: use end_date_min=now and sort ascending so current live windows come first.
    sp.set('limit', '20');
    sp.set('order', 'endDate');
    sp.set('ascending', 'true');
    sp.set('end_date_min', new Date().toISOString());
  } else {
    // Non-time tags: always request closed=false so resolved Up/Down series don't
    // consume API slots (they'd be filtered out anyway, wasting the 100-event limit).
    sp.set('closed', 'false');
    if (active !== null) sp.set('active', active!);
    sp.set('limit', String(limit));
    sp.set('order', order);
    sp.set('ascending', 'false');
  }

  // Cache key: time tags use simple key (end_date_min changes every call);
  // general tags include offset+limit since we paginate server-side.
  const cacheKey = isTimeTag
    ? `time_${tag}${parentTag ? `:${parentTag}` : ''}${search ? `&q=${search}` : ''}`
    : `${tag}:${parentTag}:${order}:${offset}:${limit}${search ? `&q=${search}` : ''}`;
  const cached = cache[cacheKey];
  const ttl = isTimeTag ? 10_000 : CACHE_TTL; // shorter cache for live markets
  if (cached && Date.now() - cached.ts < ttl) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  }

  try {
    const TIME_TAG_INTERVALS: Record<string, number> = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      'hourly': 60 * 60 * 1000,
      '4hour': 4 * 60 * 60 * 1000,
    };
    const intervalMs = TIME_TAG_INTERVALS[tag];

    let events: any[];

    if (intervalMs) {
      // ── Time-based tags: single fetch, filter to current live windows ──
      const res = await fetch(`${GAMMA_API}/events?${sp.toString()}`, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) return NextResponse.json([], { status: 200 });
      const raw: any[] = await res.json();
      const now = Date.now();
      const seen = new Set<string>();
      events = raw.filter((e: any) => {
        if (!e.endDate) return false;
        const endTime = new Date(e.endDate).getTime();
        const startTime = endTime - intervalMs;
        if (!(startTime <= now && endTime > now)) return false;
        const asset = (e.slug || '').split('-')[0];
        if (seen.has(asset)) return false;
        seen.add(asset);
        return true;
      });
    } else {
      // ── General tags: auto-paginate to collect enough real markets ──
      // Up/Down series windows dilute results (~20-90% of each page), so we
      // fetch multiple pages until we have enough non-series markets.
      const CRYPTO_NAMES = /^(btc|eth|sol|xrp|doge|bnb|ada|dot|avax|matic|link|bitcoin|ethereum|solana|dogecoin)/i;
      const isUpDown = (e: any) => {
        const slug = e.slug || '';
        const title = (e.title || '').toLowerCase();
        if (!CRYPTO_NAMES.test(slug)) return false;
        return title.includes('up or down') || slug.includes('updown') || slug.includes('up-or-down');
      };

      const target = offset + limit; // total real markets we need
      events = [];
      let apiOffset = 0;
      const MAX_API_PAGES = 6; // safety cap: 6 * 100 = 600 events max

      for (let page = 0; page < MAX_API_PAGES && events.length < target; page++) {
        sp.set('offset', String(apiOffset));
        const res = await fetch(`${GAMMA_API}/events?${sp.toString()}`, {
          cache: 'no-store',
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) break;
        const batch: any[] = await res.json();
        if (batch.length === 0) break;

        for (const e of batch) {
          if (!isUpDown(e)) events.push(e);
        }
        apiOffset += batch.length;
      }

      // Apply client-side pagination
      events = events.slice(offset, offset + limit);
    }

    // Cross-filter by parent category tag (e.g. only show "crypto" events on crypto subcategories)
    if (parentTag) {
      events = events.filter((e: any) => {
        const tags = (e.tags || []).map((t: any) => (t.slug || t.label || '').toLowerCase());
        return tags.includes(parentTag);
      });
    }

    // Client-side title search (gamma API doesn't support text search well)
    if (search) {
      const q = search.toLowerCase();
      events = events.filter((e: any) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.slug || '').toLowerCase().includes(q)
      );
    }

    // Transform to our Market card format
    const cards = events.map((e: any) => {
      const markets = e.markets || [];
      const isSingle = markets.length === 1;
      const isMulti = markets.length > 1 || e.negRisk;

      // For multi-outcome: extract top outcomes as tokens
      const tokens = isMulti
        ? markets
            .map((m: any) => {
              const outcomes = parseField(m.outcomes, ['Yes', 'No']);
              const prices = parseField(m.outcomePrices, []).map(Number);
              const tokenIds = parseField(m.clobTokenIds, []);
              return {
                id: tokenIds[0] || m.id,
                token_id: tokenIds[0] || m.id,
                outcome: 'Yes' as const,
                price: prices[0] || 0.5,
                label: m.groupItemTitle || m.question,
              };
            })
            .sort((a: any, b: any) => b.price - a.price)
            .slice(0, 6)
        : isSingle
          ? (() => {
              const m = markets[0];
              const outcomes = parseField(m.outcomes, ['Yes', 'No']);
              const prices = parseField(m.outcomePrices, []).map(Number);
              const tokenIds = parseField(m.clobTokenIds, []);
              return outcomes.map((o: string, i: number) => ({
                id: tokenIds[i] || `${m.id}-${i}`,
                token_id: tokenIds[i] || `${m.id}-${i}`,
                outcome: o as 'Yes' | 'No',
                price: prices[i] || 0.5,
                label: m.groupItemTitle || undefined,
              }));
            })()
          : [];

      return {
        id: e.id,
        condition_id: markets[0]?.conditionId || '',
        question_id: '',
        question: e.title,
        description: e.description || null,
        category: e.category || '',
        tags: (e.tags || []).map((t: any) => ({ label: t.label, slug: t.slug })),
        slug: e.slug,
        image_url: e.image || null,
        resolution_source: null,
        tokens,
        minimum_tick_size: 0.01,
        minimum_order_size: 5,
        active: !e.closed,
        closed: e.closed || false,
        resolved: false,
        winning_outcome: null,
        resolved_at: null,
        accepting_orders: !e.closed,
        end_date_iso: e.endDate || null,
        volume: e.volume || 0,
        volume_24hr: e.volume24hr || 0,
        liquidity: e.liquidity || 0,
        neg_risk: e.negRisk || false,
        created_at: e.createdAt || '',
      };
    });

    cache[cacheKey] = { data: cards, ts: Date.now() };

    return NextResponse.json(cards, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  } catch (err) {
    console.error('Live events fetch error:', err);
    return NextResponse.json([], { status: 200 });
  }
}

function parseField(val: unknown, fallback: any[]): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}
