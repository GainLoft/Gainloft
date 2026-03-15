import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { Market, EventGroup, Token, MatchInfo } from '@/lib/types';
import { buildMatchInfo, PMEvent } from '@/lib/polymarket';

export const preferredRegion = 'sin1';

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    // Check if this slug is an event group
    const { rows: egRows } = await pool.query(
      `SELECT * FROM event_groups WHERE slug = $1 LIMIT 1`,
      [slug]
    );

    if (egRows.length > 0) {
      // It's an event group — fetch all sub-markets
      const eg = egRows[0];
      const { rows: marketRows } = await pool.query(
        `SELECT * FROM markets WHERE event_group_id = $1 ORDER BY created_at`,
        [eg.id]
      );

      const marketIds = marketRows.map(r => r.id);
      const tokensByMarket = await loadTokens(marketIds);

      const markets: Market[] = marketRows.map(r => rowToMarket(r, tokensByMarket[r.id] || []));

      // Sort markets to match Polymarket display order
      sortMarketsByStrike(markets);

      const eventGroup: EventGroup = {
        id: eg.id,
        title: eg.title,
        slug: eg.slug,
        description: eg.description || null,
        category: eg.category,
        tags: eg.tags || [],
        image_url: eg.image_url || null,
        end_date_iso: eg.end_date_iso || null,
        volume: parseFloat(eg.volume) || 0,
        liquidity: parseFloat(eg.liquidity) || 0,
        created_at: eg.created_at,
        markets,
      };

      // Build match info for sports/esports events
      // We need to reconstruct the PMEvent-like object for buildMatchInfo
      const hasSportsTag = (eg.tags || []).some((t: any) =>
        ['sports', 'esports'].includes(t.slug)
      );
      if (hasSportsTag) {
        const pmEvent = reconstructPMEvent(eg, marketRows, tokensByMarket);
        const logoMap = await loadLogoMap();
        const matchInfo = buildMatchInfo(pmEvent, logoMap);
        if (matchInfo) {
          eventGroup.match = matchInfo;
          // Fetch "-more-markets" companion event and merge spreads/totals/BTTS
          const moreResult = await fetchMoreMarkets(slug, matchInfo);
          if (moreResult) {
            matchInfo.market_types.push(...moreResult.marketTypes);
            eventGroup.markets.push(...moreResult.markets);
          }
        }
      }

      // Fetch related events: try series first, fall back to same-category
      let related: { slug: string; title: string; endDate: string; closed: boolean; winning_outcome: string | null }[] = [];
      const seriesSlug = await getSeriesSlug(slug);
      if (seriesSlug) {
        related = await fetchSeriesRelated(seriesSlug, slug);
      }
      if (related.length === 0) {
        related = await fetchRelated(eg);
      }

      return NextResponse.json({
        type: 'event_group',
        data: eventGroup,
        related,
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Check if it's a standalone market
    const { rows: mRows } = await pool.query(
      `SELECT * FROM markets WHERE slug = $1 LIMIT 1`,
      [slug]
    );

    if (mRows.length === 0) {
      // Not in our DB — try fetching directly from Polymarket's gamma API
      const fallback = await fetchFromPolymarket(slug);
      if (fallback) {
        return NextResponse.json(fallback, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const mRow = mRows[0];

    // If this market belongs to an event group, redirect to the group
    if (mRow.event_group_id) {
      const { rows: parentEg } = await pool.query(
        `SELECT slug FROM event_groups WHERE id = $1`,
        [mRow.event_group_id]
      );
      if (parentEg.length > 0) {
        // Recursively fetch the parent group
        const groupRes = await fetch(
          new URL(`/api/polymarket/event/${parentEg[0].slug}`, _req.url).toString()
        );
        const groupData = await groupRes.json();
        return NextResponse.json(groupData, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    }

    const tokensByMarket = await loadTokens([mRow.id]);
    const market = rowToMarket(mRow, tokensByMarket[mRow.id] || []);

    // Fix date-only end_date_iso for timestamp-based series events (e.g. btc-updown-5m-1773244500)
    // The slug timestamp is the window start; end = start + interval
    const seriesTsMatch = slug.match(/^(.+?)-(\d{10})$/);
    if (seriesTsMatch && market.end_date_iso && !market.end_date_iso.includes('T')) {
      const ts = parseInt(seriesTsMatch[2]);
      let interval = 300; // default 5m
      if (slug.includes('-15m')) interval = 900;
      else if (slug.includes('-1h') || slug.includes('-hourly')) interval = 3600;
      else if (slug.includes('-4h')) interval = 14400;
      market.end_date_iso = new Date((ts + interval) * 1000).toISOString();
    }

    // Build match info for standalone sports markets (simple 2-outcome moneyline)
    const isSportsMarket = (mRow.tags || []).some((t: any) =>
      ['sports', 'esports'].includes(t.slug)
    );
    if (isSportsMarket) {
      const matchInfo = buildStandaloneMatchInfo(mRow, tokensByMarket[mRow.id] || []);
      if (matchInfo) {
        (market as any).match = matchInfo;
      }
    }

    // Check if this is a recurring series event
    let related: { slug: string; title: string; endDate: string; closed: boolean; winning_outcome: string | null }[] = [];
    const seriesSlugMatch = slug.match(/^(.+)-(\d{10})$/);
    if (seriesSlugMatch) {
      // Timestamp-based slug: derive series slug from prefix
      const prefix = seriesSlugMatch[1];
      const derivedSeriesSlug = prefix.replace('-updown-', '-up-or-down-');
      related = await fetchSeriesRelated(derivedSeriesSlug, slug);
    } else {
      // Non-timestamp: look up seriesSlug from gamma API
      const evSeriesSlug = await getSeriesSlug(slug);
      if (evSeriesSlug) {
        related = await fetchSeriesRelated(evSeriesSlug, slug);
      }
    }

    return NextResponse.json({
      type: 'market',
      data: market,
      related,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Event fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Load cached team logo map from api_cache (scraped by /api/polymarket/logos/scrape) */
async function loadLogoMap(): Promise<Record<string, string> | undefined> {
  try {
    const { rows } = await pool.query(`SELECT data FROM api_cache WHERE key = 'team_logos_map'`);
    if (rows[0]?.data && typeof rows[0].data === 'object') return rows[0].data;
  } catch { /* no logos available yet */ }
  return undefined;
}

/** Extract numeric sort value from groupItemTitle.
 *  Handles: "72,000", "↑ 72,000", "60,000-62,000", "<60,000", ">78,000", "1.55"
 *  For ranges like "60,000-62,000", uses the first number.
 *  For "<60,000" returns 60000 with a flag for lowest position.
 *  For ">78,000" returns 78000 with a flag for highest position.
 */
function extractStrike(title: string | undefined): number | null {
  if (!title) return null;
  const m = title.match(/([\d,]+(?:\.\d+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

/**
 * Sort markets to match Polymarket's display order:
 * - ↑ prefixed: group first, sorted by strike descending
 * - ↓ prefixed: group second, sorted by strike descending
 * - Range/plain numeric: sort ascending by first numeric value
 *   with "<X" pinned first and ">X" pinned last
 * - Non-numeric titles: keep original order
 */
function sortMarketsByStrike(markets: Market[]) {
  const hasArrows = markets.some(m => {
    const t = m.group_item_title || '';
    return t.startsWith('↑') || t.startsWith('↓');
  });
  const allHaveNumbers = markets.every(m => extractStrike(m.group_item_title) !== null);

  if (!allHaveNumbers) return; // Can't sort by strike, keep original order

  if (hasArrows) {
    // ↑ group (descending by strike), then ↓ group (descending by strike)
    markets.sort((a, b) => {
      const aTitle = a.group_item_title || '';
      const bTitle = b.group_item_title || '';
      const aUp = aTitle.startsWith('↑');
      const bUp = bTitle.startsWith('↑');
      if (aUp !== bUp) return aUp ? -1 : 1; // ↑ first
      const aVal = extractStrike(aTitle) ?? 0;
      const bVal = extractStrike(bTitle) ?? 0;
      return bVal - aVal; // descending within group
    });
  } else {
    // Ascending by first numeric value; "<X" pinned first, ">X" pinned last
    markets.sort((a, b) => {
      const aTitle = (a.group_item_title || '').trim();
      const bTitle = (b.group_item_title || '').trim();
      const aLt = aTitle.startsWith('<');
      const bLt = bTitle.startsWith('<');
      const aGt = aTitle.startsWith('>');
      const bGt = bTitle.startsWith('>');
      if (aLt && !bLt) return -1;
      if (!aLt && bLt) return 1;
      if (aGt && !bGt) return 1;
      if (!aGt && bGt) return -1;
      const aVal = extractStrike(aTitle) ?? 0;
      const bVal = extractStrike(bTitle) ?? 0;
      return aVal - bVal;
    });
  }
}

async function loadTokens(marketIds: string[]): Promise<Record<string, Token[]>> {
  if (marketIds.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT market_id, token_id, outcome, price, label FROM tokens WHERE market_id = ANY($1)`,
    [marketIds]
  );
  const map: Record<string, Token[]> = {};
  for (const t of rows) {
    if (!map[t.market_id]) map[t.market_id] = [];
    map[t.market_id].push({
      id: t.token_id,
      token_id: t.token_id,
      outcome: t.outcome,
      price: parseFloat(t.price),
      label: t.label || undefined,
    });
  }
  return map;
}

function rowToMarket(row: any, tokens: Token[]): Market {
  return {
    id: row.id,
    condition_id: row.condition_id || '',
    question_id: row.question_id || '',
    question: row.question,
    group_item_title: row.group_item_title || undefined,
    description: row.description || null,
    category: row.category,
    tags: row.tags || [],
    slug: row.slug,
    image_url: row.image_url || null,
    resolution_source: row.resolution_source || null,
    tokens,
    minimum_tick_size: parseFloat(row.minimum_tick_size) || 0.01,
    minimum_order_size: parseFloat(row.minimum_order_size) || 5,
    active: row.active,
    closed: row.closed,
    resolved: row.resolved || false,
    winning_outcome: row.winning_outcome || null,
    resolved_at: row.resolved_at || null,
    accepting_orders: row.accepting_orders,
    end_date_iso: row.end_date_iso || null,
    volume: parseFloat(row.volume) || 0,
    volume_24hr: parseFloat(row.volume_24hr) || 0,
    volume_1wk: parseFloat(row.volume_1wk) || 0,
    volume_1mo: parseFloat(row.volume_1mo) || 0,
    liquidity: parseFloat(row.liquidity) || 0,
    neg_risk: row.neg_risk || false,
    best_bid: parseFloat(row.best_bid) || 0,
    best_ask: parseFloat(row.best_ask) || 0,
    spread: parseFloat(row.spread) || 0,
    last_trade_price: parseFloat(row.last_trade_price) || 0,
    price_change_1h: parseFloat(row.price_change_1h) || 0,
    price_change_24h: parseFloat(row.price_change_24h) || 0,
    price_change_1w: parseFloat(row.price_change_1w) || 0,
    price_change_1m: parseFloat(row.price_change_1m) || 0,
    competitive: parseFloat(row.competitive) || 0,
    comment_count: parseInt(row.comment_count) || 0,
    submitted_by: row.submitted_by || undefined,
    created_at: row.created_at,
  };
}

/** Reconstruct a PMEvent-like object for buildMatchInfo */
function reconstructPMEvent(eg: any, marketRows: any[], tokensByMarket?: Record<string, Token[]>): PMEvent {
  return {
    id: eg.polymarket_id || eg.id,
    ticker: eg.slug,
    slug: eg.slug,
    title: eg.title,
    description: eg.description || '',
    endDate: eg.end_date_iso || '',
    startDate: eg.created_at || '',
    creationDate: eg.created_at || '',
    image: eg.image_url || '',
    icon: '',
    active: !marketRows.every((m: any) => m.closed),
    closed: marketRows.every((m: any) => m.closed),
    liquidity: parseFloat(eg.liquidity) || 0,
    volume: parseFloat(eg.volume) || 0,
    volume24hr: parseFloat(eg.volume_24hr) || 0,
    volume1wk: parseFloat(eg.volume_1wk) || 0,
    volume1mo: parseFloat(eg.volume_1mo) || 0,
    commentCount: parseInt(eg.comment_count) || 0,
    negRisk: eg.neg_risk || false,
    competitive: parseFloat(eg.competitive) || 0,
    tags: (eg.tags || []).map((t: any) => ({ id: t.slug, label: t.label, slug: t.slug })),
    markets: marketRows.map((m: any) => {
      // Use actual token prices from DB when available
      const tokens = tokensByMarket?.[m.id] || [];
      const yesToken = tokens.find(t => t.outcome === 'Yes');
      const noToken = tokens.find(t => t.outcome === 'No');
      const yesPrice = yesToken?.price ?? 0.5;
      const noPrice = noToken?.price ?? 0.5;
      const outcomes = [
        yesToken?.label || 'Yes',
        noToken?.label || 'No',
      ];
      return {
        id: m.polymarket_id || m.id,
        question: m.question,
        conditionId: m.condition_id || '',
        slug: m.slug,
        resolutionSource: m.resolution_source || '',
        endDate: m.end_date_iso || '',
        startDate: m.created_at || '',
        image: m.image_url || '',
        icon: '',
        description: m.description || '',
        outcomes,
        outcomePrices: [String(yesPrice), String(noPrice)],
        volume: String(m.volume || 0),
        active: m.active,
        closed: m.closed,
        clobTokenIds: [],
        groupItemTitle: m.group_item_title || '',
        liquidity: String(m.liquidity || 0),
        orderPriceMinTickSize: parseFloat(m.minimum_tick_size) || 0.01,
        orderMinSize: parseFloat(m.minimum_order_size) || 5,
        bestBid: 0,
        bestAsk: 0,
        lastTradePrice: 0,
        spread: 0,
      };
    }),
    createdAt: eg.created_at || '',
    updatedAt: eg.updated_at || '',
  };
}

/** Look up the seriesSlug for an event from the gamma API */
async function getSeriesSlug(eventSlug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug)}&limit=1`, { cache: 'no-store' });
    if (!res.ok) return null;
    const events = await res.json();
    return events?.[0]?.seriesSlug || null;
  } catch {
    return null;
  }
}

/** Fetch event/market directly from Polymarket gamma API when not in our DB */
async function fetchFromPolymarket(slug: string): Promise<any | null> {
  try {
    // Try as event first
    const eventRes = await fetch(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}&limit=1`, { cache: 'no-store' });
    if (eventRes.ok) {
      const events = await eventRes.json();
      if (events.length > 0) {
        const ev = events[0];
        const pmMarkets = ev.markets || [];

        if (pmMarkets.length > 1 || ev.negRisk) {
          // Multi-outcome event group
          const markets: Market[] = pmMarkets.map((m: any) => ({
            id: m.id,
            condition_id: m.conditionId || '',
            question_id: '',
            question: m.question,
            group_item_title: m.groupItemTitle || undefined,
            description: m.description || null,
            category: m.category || ev.category || '',
            tags: (ev.tags || []).map((t: any) => ({ label: t.label, slug: t.slug })),
            slug: m.slug,
            image_url: m.image || ev.image || null,
            resolution_source: m.resolutionSource || null,
            tokens: parseOutcomePrices(m),
            minimum_tick_size: m.orderPriceMinTickSize || 0.01,
            minimum_order_size: m.orderMinSize || 5,
            active: m.active && !m.closed,
            closed: m.closed || false,
            resolved: !!m.closedTime,
            winning_outcome: null,
            resolved_at: m.closedTime || null,
            accepting_orders: m.active && !m.closed,
            end_date_iso: m.endDate || m.endDateIso || null,
            volume: parseFloat(m.volume) || 0,
            volume_24hr: m.volume24hr || 0,
            liquidity: parseFloat(m.liquidity) || 0,
            neg_risk: ev.negRisk || false,
            created_at: m.createdAt || ev.createdAt || '',
          }));

          // Sort to match Polymarket display order
          sortMarketsByStrike(markets);

          const eventGroup: EventGroup = {
            id: ev.id,
            title: ev.title,
            slug: ev.slug,
            description: ev.description || null,
            category: ev.category || '',
            tags: (ev.tags || []).map((t: any) => ({ label: t.label, slug: t.slug })),
            image_url: ev.image || null,
            end_date_iso: ev.endDate || null,
            volume: ev.volume || 0,
            liquidity: ev.liquidity || 0,
            created_at: ev.createdAt || '',
            markets,
          };

          // Build match info for sports events from gamma API
          const hasSportsTag = (ev.tags || []).some((t: any) =>
            ['sports', 'esports'].includes(t.slug)
          );
          if (hasSportsTag) {
            const pmEvent: PMEvent = {
              id: ev.id, ticker: ev.ticker || ev.slug, slug: ev.slug,
              title: ev.title, description: ev.description || '',
              startDate: ev.startDate || '', creationDate: ev.creationDate || '',
              endDate: ev.endDate || '', image: ev.image || '', icon: ev.icon || '',
              active: ev.active, closed: ev.closed,
              liquidity: ev.liquidity || 0, volume: ev.volume || 0,
              volume24hr: ev.volume24hr || 0, volume1wk: ev.volume1wk || 0,
              volume1mo: ev.volume1mo || 0, commentCount: ev.commentCount || 0,
              negRisk: ev.negRisk || false, competitive: ev.competitive || 0,
              markets: pmMarkets, tags: (ev.tags || []).map((t: any) => ({ id: t.id || t.slug, label: t.label, slug: t.slug })),
              createdAt: ev.createdAt || '', updatedAt: ev.updatedAt || '',
            };
            const logoMap = await loadLogoMap();
            const matchInfo = buildMatchInfo(pmEvent, logoMap);
            if (matchInfo) {
              eventGroup.match = matchInfo;
              const moreResult = await fetchMoreMarkets(ev.slug, matchInfo);
              if (moreResult) {
                matchInfo.market_types.push(...moreResult.marketTypes);
                eventGroup.markets.push(...moreResult.markets);
              }
            }
          }

          const seriesRelated = ev.seriesSlug
            ? await fetchSeriesRelated(ev.seriesSlug, ev.slug)
            : [];

          return { type: 'event_group', data: eventGroup, related: seriesRelated };
        } else if (pmMarkets.length === 1) {
          // Single market event
          const m = pmMarkets[0];
          const market: Market = {
            id: m.id,
            condition_id: m.conditionId || '',
            question_id: '',
            question: m.question || ev.title,
            description: m.description || ev.description || null,
            category: m.category || ev.category || '',
            tags: (ev.tags || []).map((t: any) => ({ label: t.label, slug: t.slug })),
            slug: m.slug || ev.slug,
            image_url: m.image || ev.image || null,
            resolution_source: m.resolutionSource || null,
            tokens: parseOutcomePrices(m),
            minimum_tick_size: m.orderPriceMinTickSize || 0.01,
            minimum_order_size: m.orderMinSize || 5,
            active: m.active && !m.closed,
            closed: m.closed || false,
            resolved: !!m.closedTime,
            winning_outcome: null,
            resolved_at: m.closedTime || null,
            accepting_orders: m.active && !m.closed,
            end_date_iso: m.endDate || m.endDateIso || null,
            volume: parseFloat(m.volume) || ev.volume || 0,
            volume_24hr: m.volume24hr || ev.volume24hr || 0,
            liquidity: parseFloat(m.liquidity) || ev.liquidity || 0,
            neg_risk: ev.negRisk || false,
            created_at: m.createdAt || ev.createdAt || '',
          };
          // Fetch related series events if this is a recurring market
          const seriesRelated = ev.seriesSlug
            ? await fetchSeriesRelated(ev.seriesSlug, ev.slug)
            : [];

          return { type: 'market', data: market, related: seriesRelated };
        }
      }
    }

    // Try as standalone market
    const marketRes = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&limit=1`, { cache: 'no-store' });
    if (marketRes.ok) {
      const markets = await marketRes.json();
      if (markets.length > 0) {
        const m = markets[0];
        const market: Market = {
          id: m.id,
          condition_id: m.conditionId || '',
          question_id: '',
          question: m.question,
          description: m.description || null,
          category: m.category || '',
          tags: [],
          slug: m.slug,
          image_url: m.image || null,
          resolution_source: m.resolutionSource || null,
          tokens: parseOutcomePrices(m),
          minimum_tick_size: m.orderPriceMinTickSize || 0.01,
          minimum_order_size: m.orderMinSize || 5,
          active: m.active && !m.closed,
          closed: m.closed || false,
          resolved: !!m.closedTime,
          winning_outcome: null,
          resolved_at: m.closedTime || null,
          accepting_orders: m.active && !m.closed,
          end_date_iso: m.endDate || m.endDateIso || null,
          volume: parseFloat(m.volume) || 0,
          volume_24hr: m.volume24hr || 0,
          liquidity: parseFloat(m.liquidity) || 0,
          neg_risk: m.negRiskOther || false,
          created_at: m.createdAt || '',
        };
        return { type: 'market', data: market, related: [] };
      }
    }

    return null;
  } catch (err) {
    console.error('Polymarket gamma fallback error:', err);
    return null;
  }
}

/**
 * Fetch the "-more-markets" companion event from Polymarket Gamma API.
 * Parses Spread, O/U, and BTTS markets and returns them as market_types + Market objects.
 */
async function fetchMoreMarkets(
  slug: string,
  matchInfo: MatchInfo
): Promise<{ marketTypes: MatchInfo['market_types']; markets: Market[] } | null> {
  try {
    const moreSlug = `${slug}-more-markets`;
    const res = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(moreSlug)}&limit=1`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const events = await res.json();
    if (!events?.length) return null;

    const moreEvent = events[0];
    const rawMarkets: any[] = moreEvent.markets || [];
    if (rawMarkets.length === 0) return null;

    const team1 = matchInfo.team1;
    const team2 = matchInfo.team2;
    const marketTypes: MatchInfo['market_types'] = [];
    const outMarkets: Market[] = [];

    // Helper to safely parse array fields
    const parseArr = (val: unknown): string[] => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
      return [];
    };

    // Helper to create a Market object for the trade panel
    const toMarket = (m: any): Market => ({
      id: m.id,
      condition_id: m.conditionId || '',
      question_id: m.questionID || '',
      question: m.question,
      group_item_title: m.groupItemTitle || undefined,
      description: m.description || null,
      category: moreEvent.category || '',
      tags: (moreEvent.tags || []).map((t: any) => ({ label: t.label, slug: t.slug })),
      slug: m.slug,
      image_url: m.image || moreEvent.image || null,
      resolution_source: m.resolutionSource || null,
      tokens: parseOutcomePrices(m),
      minimum_tick_size: m.orderPriceMinTickSize || 0.01,
      minimum_order_size: m.orderMinSize || 5,
      active: m.active && !m.closed,
      closed: m.closed || false,
      resolved: !!m.closedTime,
      winning_outcome: null,
      resolved_at: m.closedTime || null,
      accepting_orders: m.active && !m.closed,
      end_date_iso: m.endDate || null,
      volume: parseFloat(m.volume) || 0,
      volume_24hr: 0,
      liquidity: parseFloat(m.liquidity) || 0,
      neg_risk: moreEvent.negRisk || false,
      created_at: m.createdAt || '',
    });

    // ── Classify markets ──

    // Spread markets: "Spread: TeamName (-1.5)" or "Spread: TeamName (+1.5)"
    const spreadMarkets = rawMarkets.filter(m =>
      /^Spread:/i.test(m.question || '')
    );

    // O/U markets: "Team1 vs. Team2: O/U 2.5"
    const ouMarkets = rawMarkets.filter(m =>
      /O\/U\s+[\d.]+/i.test(m.question || '')
    );

    // BTTS: "Team1 vs. Team2: Both Teams to Score"
    const bttsMarket = rawMarkets.find(m =>
      /both teams to score/i.test(m.question || '')
    );

    // ── Process Spreads ──
    // Group by handicap value: e.g., -1.5 has two markets (one per team)
    if (spreadMarkets.length > 0) {
      // Extract handicap value from each market question
      // "Spread: Crystal Palace FC (-1.5)" → handicap = -1.5
      const spreadsByValue = new Map<number, any[]>();
      for (const m of spreadMarkets) {
        const match = (m.question || '').match(/\((-?[\d.]+)\)/);
        if (match) {
          const val = parseFloat(match[1]);
          if (!spreadsByValue.has(val)) spreadsByValue.set(val, []);
          spreadsByValue.get(val)!.push(m);
        }
      }

      // Sort handicap values ascending
      const sortedValues = Array.from(spreadsByValue.keys()).sort((a, b) => a - b);

      // Build one unified "Spreads" market type with slider_values
      // For each value, we create two outcome buttons (team1 spread, team2 spread)
      let totalSpreadVol = 0;
      const allSpreadEntries: { value: number; markets: { id: string; label: string; price: number }[] }[] = [];

      for (const val of sortedValues) {
        const pair = spreadsByValue.get(val)!;
        // Determine which market belongs to which team
        let t1Market: any = null;
        let t2Market: any = null;
        for (const m of pair) {
          const q = (m.question || '').toLowerCase();
          if (q.includes(team1.name.toLowerCase()) || q.includes(team1.abbr.toLowerCase())) {
            t1Market = m;
          } else {
            t2Market = m;
          }
        }
        // If only one market for this value, try to infer
        if (!t1Market && !t2Market && pair.length === 1) {
          t1Market = pair[0];
        }

        const entries: { id: string; label: string; price: number }[] = [];

        if (t1Market) {
          const prices = parseArr(t1Market.outcomePrices);
          const yesPrice = parseFloat(prices[0] || '0.5');
          entries.push({
            id: `${t1Market.id}-0`,
            label: `${team1.abbr} ${val > 0 ? '+' : ''}${val}`,
            price: yesPrice,
          });
          totalSpreadVol += parseFloat(t1Market.volume || '0');
          outMarkets.push(toMarket(t1Market));
        }

        if (t2Market) {
          const prices = parseArr(t2Market.outcomePrices);
          const yesPrice = parseFloat(prices[0] || '0.5');
          // The opposing team gets the opposite sign
          const oppositeVal = -val;
          entries.push({
            id: `${t2Market.id}-0`,
            label: `${team2.abbr} ${oppositeVal > 0 ? '+' : ''}${oppositeVal}`,
            price: yesPrice,
          });
          totalSpreadVol += parseFloat(t2Market.volume || '0');
          outMarkets.push(toMarket(t2Market));
        }

        allSpreadEntries.push({ value: val, markets: entries });
      }

      if (allSpreadEntries.length > 0) {
        // Create one market_type per spread value, and set slider_values on the first one
        // Actually, we want a single "Spreads" card with a slider — so we store all values
        // and only show markets for the selected value. Use slider_values field.
        // The frontend will handle switching between values.
        for (let i = 0; i < allSpreadEntries.length; i++) {
          const entry = allSpreadEntries[i];
          marketTypes.push({
            id: `more-spread-${entry.value}`,
            tab: 'game-lines',
            label: 'Spreads',
            volume: totalSpreadVol,
            markets: entry.markets,
            slider_values: i === 0 ? sortedValues : undefined,
          });
        }
      }
    }

    // ── Process O/U (Totals) ──
    if (ouMarkets.length > 0) {
      // Extract O/U value: "Team1 vs. Team2: O/U 2.5" → 2.5
      const ouByValue: { value: number; market: any }[] = [];
      for (const m of ouMarkets) {
        const match = (m.question || '').match(/O\/U\s+([\d.]+)/i);
        if (match) {
          ouByValue.push({ value: parseFloat(match[1]), market: m });
        }
      }
      ouByValue.sort((a, b) => a.value - b.value);

      const totalOuVol = ouByValue.reduce((s, o) => s + (parseFloat(o.market.volume || '0')), 0);
      const ouValues = ouByValue.map(o => o.value);

      for (let i = 0; i < ouByValue.length; i++) {
        const { value, market: m } = ouByValue[i];
        const prices = parseArr(m.outcomePrices);
        const overPrice = parseFloat(prices[0] || '0.5');
        const underPrice = parseFloat(prices[1] || '0.5');

        marketTypes.push({
          id: `more-ou-${value}`,
          tab: 'game-lines',
          label: 'Totals',
          volume: totalOuVol,
          markets: [
            { id: `${m.id}-0`, label: `O ${value}`, price: overPrice },
            { id: `${m.id}-1`, label: `U ${value}`, price: underPrice },
          ],
          slider_values: i === 0 ? ouValues : undefined,
        });

        outMarkets.push(toMarket(m));
      }
    }

    // ── Process BTTS ──
    if (bttsMarket) {
      const prices = parseArr(bttsMarket.outcomePrices);
      const yesPrice = parseFloat(prices[0] || '0.5');
      const noPrice = parseFloat(prices[1] || '0.5');

      marketTypes.push({
        id: `more-btts-${bttsMarket.id}`,
        tab: 'game-lines',
        label: 'Both Teams to Score?',
        volume: parseFloat(bttsMarket.volume || '0'),
        markets: [
          { id: `${bttsMarket.id}-0`, label: 'Yes', price: yesPrice },
          { id: `${bttsMarket.id}-1`, label: 'No', price: noPrice },
        ],
      });

      outMarkets.push(toMarket(bttsMarket));
    }

    if (marketTypes.length === 0) return null;
    return { marketTypes, markets: outMarkets };
  } catch (err) {
    console.error('More markets fetch error:', err);
    return null;
  }
}

/** Safely parse a field that may be a JSON string or already an array */
function parseJsonField<T>(val: unknown, fallback: T): T {
  if (Array.isArray(val)) return val as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}

/** Parse outcomePrices from Polymarket market data into Token[] */
function parseOutcomePrices(m: any): Token[] {
  const outcomes: string[] = parseJsonField(m.outcomes, ['Yes', 'No']);
  const prices: string[] = parseJsonField(m.outcomePrices, []);
  const tokenIds: string[] = parseJsonField(m.clobTokenIds, []);
  return outcomes.map((outcome: string, i: number) => ({
    id: tokenIds[i] || `${m.id}-${i}`,
    token_id: tokenIds[i] || `${m.id}-${i}`,
    outcome: outcome as 'Yes' | 'No',
    price: parseFloat(prices[i]) || (i === 0 ? 0.5 : 0.5),
    label: m.groupItemTitle || undefined,
  }));
}

/** Extract winning outcome from a Polymarket event */
function extractWinningOutcome(e: any): string | null {
  if (e.closed && e.markets?.[0]) {
    const m = e.markets[0];
    const outcomes = parseJsonField<string[]>(m.outcomes, ['Up', 'Down']);
    const prices = parseJsonField<string[]>(m.outcomePrices, []);
    const winIdx = prices.findIndex((p: string) => parseFloat(p) >= 0.99);
    if (winIdx >= 0 && outcomes[winIdx]) return outcomes[winIdx];
  }
  return null;
}

/** Fetch related events for a recurring series by computing nearby event slugs */
async function fetchSeriesRelated(seriesSlug: string, currentSlug: string) {
  try {
    // Parse the slug prefix and timestamp from the current event slug
    // e.g., "btc-updown-5m-1773070800" → prefix="btc-updown-5m", ts=1773070800
    const tsMatch = currentSlug.match(/^(.+)-(\d{10})$/);

    if (tsMatch) {
      const prefix = tsMatch[1];
      const currentTs = parseInt(tsMatch[2]);

      // Determine interval from the series slug (e.g., "btc-up-or-down-5m" → 300s)
      let interval = 300; // default 5m
      if (seriesSlug.includes('-15m')) interval = 900;
      else if (seriesSlug.includes('-1h') || seriesSlug.includes('-hourly')) interval = 3600;
      else if (seriesSlug.includes('-4h')) interval = 14400;

      // Generate slugs: 12 past + 3 future (at least 10 past results)
      const slugs: string[] = [];
      for (let i = -12; i <= 3; i++) {
        if (i === 0) continue; // skip current
        slugs.push(`${prefix}-${currentTs + i * interval}`);
      }

      // Fetch events in parallel
      const results = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const res = await fetch(
              `https://gamma-api.polymarket.com/events?slug=${slug}`,
              { cache: 'no-store' }
            );
            if (!res.ok) return null;
            const data = await res.json();
            return data[0] || null;
          } catch {
            return null;
          }
        })
      );

      return results
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
        .map((e) => ({
          slug: e.slug,
          title: e.title,
          endDate: e.endDate || '',
          closed: e.closed || false,
          winning_outcome: extractWinningOutcome(e),
        }));
    }

    // Non-timestamp slugs (daily, weekly, etc.): use the series?slug= endpoint
    // which returns the full series object with an events array.
    const res = await fetch(
      `https://gamma-api.polymarket.com/series?slug=${encodeURIComponent(seriesSlug)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    const seriesData = await res.json();

    // The endpoint returns an array with one series object containing events
    const seriesObj = Array.isArray(seriesData) ? seriesData[0] : seriesData;
    const events: any[] = seriesObj?.events || [];

    // Filter out archived events (title starts with "arch"), skip current,
    // and only show recent past + upcoming (last 7 closed + all open)
    const now = new Date();
    const filtered = events
      .filter((e: any) => {
        if (!e.slug || e.slug === currentSlug) return false;
        // Skip archived events
        if (typeof e.title === 'string' && e.title.startsWith('arch')) return false;
        return true;
      })
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

    // Take last 7 closed + all upcoming
    const closed = filtered.filter(e => e.closed || new Date(e.endDate) < now);
    const upcoming = filtered.filter(e => !e.closed && new Date(e.endDate) >= now);
    const recentClosed = closed.slice(-7);

    return [...recentClosed, ...upcoming].map((e) => ({
      slug: e.slug,
      title: e.title,
      endDate: e.endDate || '',
      closed: e.closed || false,
      winning_outcome: extractWinningOutcome(e),
    }));
  } catch {
    return [];
  }
}

/** Fetch related events (same category or similar title) */
async function fetchRelated(eg: any) {
  try {
    const { rows } = await pool.query(`
      SELECT slug, title, end_date_iso,
        (SELECT bool_and(closed) FROM markets WHERE event_group_id = event_groups.id) AS closed,
        (SELECT winning_outcome FROM markets WHERE event_group_id = event_groups.id AND winning_outcome IS NOT NULL LIMIT 1) AS winning_outcome
      FROM event_groups
      WHERE category = $1 AND id != $2 AND polymarket_id IS NOT NULL
      ORDER BY volume_24hr DESC
      LIMIT 10
    `, [eg.category, eg.id]);

    return rows.map((r: any) => ({
      slug: r.slug,
      title: r.title,
      endDate: r.end_date_iso || '',
      closed: r.closed || false,
      winning_outcome: r.winning_outcome || null,
    }));
  } catch {
    return [];
  }
}

/** Build match info for standalone sports markets (simple moneyline with Yes/No tokens) */
function buildStandaloneMatchInfo(mRow: any, tokens: Token[]): MatchInfo | null {
  const title: string = mRow.question || '';
  // Match "Team1 vs. Team2" or "Prefix: Team1 vs Team2"
  const vsMatch = title.match(/^(?:.+?:\s+)?(.+?)\s+vs\.?\s+(.+?)$/i);
  if (!vsMatch) return null;

  const team1Name = vsMatch[1].trim();
  // Clean parenthetical suffixes from team2
  const team2Name = vsMatch[2].replace(/\s*\([^)]*\)\s*$/, '').trim();

  const yesToken = tokens.find(t => t.outcome === 'Yes');
  const noToken = tokens.find(t => t.outcome === 'No');
  const t1Price = yesToken?.price ?? 0.5;
  const t2Price = noToken?.price ?? 0.5;

  // Derive abbreviations from slug
  const slugParts = (mRow.slug || '').split('-');
  let abbr1 = team1Name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 3);
  let abbr2 = team2Name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 3);
  if (slugParts.length >= 3) {
    abbr1 = slugParts[1]?.toUpperCase() || abbr1;
    abbr2 = slugParts[2]?.toUpperCase() || abbr2;
  }

  // Derive league from tags
  const tags = (mRow.tags || []).map((t: any) => t.slug);
  const leagueMap: Record<string, string> = {
    nba: 'NBA', nhl: 'NHL', nfl: 'NFL', mlb: 'MLB', epl: 'EPL', ucl: 'UCL',
    'la-liga': 'La Liga', soccer: 'Soccer', tennis: 'Tennis', cricket: 'Cricket',
    golf: 'Golf', ufc: 'UFC', boxing: 'Boxing', chess: 'Chess', f1: 'F1',
    'league-of-legends': 'LoL', 'counter-strike-2': 'CS2', 'dota-2': 'Dota 2',
    valorant: 'Valorant', esports: 'Esports', baseball: 'Baseball', hockey: 'Hockey',
  };
  let league = 'Sports';
  for (const t of tags) {
    if (leagueMap[t]) { league = leagueMap[t]; break; }
  }

  const endDate = new Date(mRow.end_date_iso || '');
  const now = new Date();
  let status: 'upcoming' | 'live' | 'final' = 'upcoming';
  if (mRow.closed) status = 'final';
  else if (endDate < now) status = 'final';

  return {
    team1: { name: team1Name, abbr: abbr1, logo: '' },
    team2: { name: team2Name, abbr: abbr2, logo: '' },
    event_image: mRow.image_url || '',
    league,
    start_time: mRow.end_date_iso || mRow.created_at || '',
    status,
    market_types: [{
      id: 'moneyline',
      tab: 'game-lines',
      label: 'Moneyline',
      volume: parseFloat(mRow.volume) || 0,
      markets: [
        { id: `${mRow.id}-0`, label: team1Name, price: t1Price },
        { id: `${mRow.id}-1`, label: team2Name, price: t2Price },
      ],
    }],
  };
}
