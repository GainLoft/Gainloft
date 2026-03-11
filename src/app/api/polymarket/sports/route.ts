import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { EventGroup, Token, MatchInfo, Market } from '@/lib/types';
import { buildMatchInfo, mapToMarket, PMEvent, PMMarket } from '@/lib/polymarket';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const preferredRegion = 'sin1';

// Sync is handled by Vercel Cron (vercel.json) calling /api/polymarket/sync/cron

/**
 * GET /api/polymarket/sports?tab=live|futures&offset=0&limit=30&sport=&league=
 *
 * Paginated sports data.
 *   tab=live  → match events from local DB (synced by background cron)
 *   tab=futures → outrights / season bets from local DB
 *
 * Returns: { events: EventGroup[], hasMore: boolean, total: number, taxonomy?: TaxonomyItem[] }
 * taxonomy is only included when offset=0
 */

const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 100;

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const tab = params.get('tab') === 'futures' ? 'futures' : 'live';
    const offset = Math.max(0, parseInt(params.get('offset') || '0') || 0);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(params.get('limit') || String(PAGE_SIZE_DEFAULT)) || PAGE_SIZE_DEFAULT));
    const sportFilter = params.get('sport') || '';
    const leagueFilter = params.get('league') || '';

    if (tab === 'live') {
      return await handleMatches(offset, limit, sportFilter, leagueFilter);
    }

    // Build tag filter conditions for DB-based futures tab
    const SPORT_ROOT_CONDITION = `(${[
      'sports', 'esports', ...Object.keys(PARENT_SPORTS),
    ].map(s => `t.tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ')})`;

    const tagConditions: string[] = [SPORT_ROOT_CONDITION];
    const tagParams: any[] = [];
    let paramIdx = 1;

    if (sportFilter) {
      tagConditions.push(`t.tags @> $${paramIdx}::jsonb`);
      tagParams.push(JSON.stringify([{ slug: sportFilter }]));
      paramIdx++;
    }
    if (leagueFilter) {
      tagConditions.push(`t.tags @> $${paramIdx}::jsonb`);
      tagParams.push(JSON.stringify([{ slug: leagueFilter }]));
      paramIdx++;
    }

    const tagWhere = tagConditions.join(' AND ');
    return await handleFutures(tagWhere, tagParams, paramIdx, offset, limit);
  } catch (err) {
    console.error('Sports fetch error:', err);
    return NextResponse.json({ events: [], hasMore: false, total: 0 }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════
//  MATCHES (tab=live) — reads from local DB (synced by background cron)
// ═══════════════════════════════════════════════════

/** Parse a value that might be a JSON string or already an array */
function parseField(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

/** Esports tags where Match Winner settled = match truly over */
const ESPORTS_TAGS = new Set([
  'esports', 'counter-strike-2', 'dota-2', 'league-of-legends',
  'valorant', 'honor-of-kings', 'call-of-duty',
]);

/**
 * Check if a match is truly finished.
 * - For esports: Match Winner settled (near 0/1) means series is decided
 * - For traditional sports (NBA, soccer, etc.): Match Winner can settle early
 *   (big lead in Q4) while the game is still live, so we DON'T filter those out.
 *   We rely on Polymarket's closed=false flag from the API instead.
 */
function isMatchSettled(ev: PMEvent): boolean {
  const markets = ev.markets || [];
  const endDate = ev.endDate ? new Date(ev.endDate) : null;
  const isPast = endDate ? endDate < new Date() : false;

  // For esports: always check settlement (they can settle mid-match)
  // For traditional sports: only check if end date has passed
  const isEsports = ev.tags?.some(t => ESPORTS_TAGS.has(t.slug));
  if (!isEsports && !isPast) return false;

  // Find Match Winner / Moneyline market
  const mw = markets.find(m =>
    m.groupItemTitle === 'Match Winner' || m.question === 'Match Winner'
  ) || markets.find(m =>
    !m.groupItemTitle && m.question === ev.title
  );
  if (!mw) {
    // For soccer-style 3-way: check if all team sub-markets are settled
    const vsMatch = ev.title.match(/^(?:.+?:\s+)?(.+?)\s+vs\.?\s+(.+?)(?:\s+\(BO\d+\))?(?:\s+-\s+.+)?$/i);
    if (vsMatch) {
      const team1 = vsMatch[1].trim();
      const team2 = vsMatch[2].replace(/\s*\([^)]*\)\s*$/, '').trim();
      const t1m = markets.find(m => m.groupItemTitle === team1);
      const t2m = markets.find(m => m.groupItemTitle === team2);
      if (t1m && t2m) {
        const p1 = parseFloat(parseField(t1m.outcomePrices)[0] || '0.5');
        const p2 = parseFloat(parseField(t2m.outcomePrices)[0] || '0.5');
        return (p1 >= 0.95 || p1 <= 0.05) && (p2 >= 0.95 || p2 <= 0.05);
      }
    }
    // Fallback: if end date is past and ALL sub-markets are settled, treat as done
    if (isPast && markets.length > 0) {
      const allSettled = markets.every(m => {
        const p = parseFloat(parseField(m.outcomePrices)[0] || '0.5');
        return p >= 0.95 || p <= 0.05;
      });
      if (allSettled) return true;
    }
    return false;
  }
  const prices = parseField(mw.outcomePrices);
  if (prices.length < 2) return false;
  const p0 = parseFloat(prices[0] || '0.5');
  return p0 >= 0.95 || p0 <= 0.05;
}

/** Check if a market is a placeholder (no price data) */
function isPlaceholderMarket(pm: PMMarket): boolean {
  return parseField(pm.outcomePrices).length === 0;
}

async function handleMatches(offset: number, limit: number, sportFilter: string, leagueFilter: string) {
  // Build tag filter conditions (same pattern as handleFutures)
  const SPORT_ROOT_CONDITION_EG = `(${[
    'sports', 'esports', ...Object.keys(PARENT_SPORTS),
  ].map(s => `eg.tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ')})`;

  const SPORT_ROOT_CONDITION_M = `(${[
    'sports', 'esports', ...Object.keys(PARENT_SPORTS),
  ].map(s => `m.tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ')})`;

  const egTagConditions: string[] = [SPORT_ROOT_CONDITION_EG];
  const mTagConditions: string[] = [SPORT_ROOT_CONDITION_M];
  const tagParams: any[] = [];
  let paramIdx = 1;

  if (sportFilter) {
    egTagConditions.push(`eg.tags @> $${paramIdx}::jsonb`);
    mTagConditions.push(`m.tags @> $${paramIdx}::jsonb`);
    tagParams.push(JSON.stringify([{ slug: sportFilter }]));
    paramIdx++;
  }
  if (leagueFilter) {
    egTagConditions.push(`eg.tags @> $${paramIdx}::jsonb`);
    mTagConditions.push(`m.tags @> $${paramIdx}::jsonb`);
    tagParams.push(JSON.stringify([{ slug: leagueFilter }]));
    paramIdx++;
  }

  const egTagWhere = egTagConditions.join(' AND ');
  const mTagWhere = mTagConditions.join(' AND ');

  // 1. Query event_groups with "vs" in title (matches)
  const { rows: egRows } = await pool.query(
    `SELECT eg.id, eg.title, eg.slug, eg.description, eg.category, eg.tags,
       eg.image_url, eg.end_date_iso, eg.volume, eg.volume_24hr, eg.liquidity,
       eg.neg_risk, eg.created_at, eg.polymarket_id
     FROM event_groups eg
     WHERE eg.polymarket_id IS NOT NULL
       AND ${egTagWhere}
       AND eg.title ~* 'vs\\.?'
       AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
     ORDER BY eg.volume DESC
     LIMIT 300`,
    tagParams
  );

  // 2. Query standalone markets (no event_group) with "vs" in title
  const { rows: standaloneRows } = await pool.query(
    `SELECT m.id, m.question, m.slug, m.category, m.tags,
       m.image_url, m.end_date_iso, m.volume, m.volume_24hr, m.liquidity,
       m.neg_risk, m.created_at, m.active, m.closed, m.polymarket_id,
       m.condition_id, m.minimum_tick_size, m.minimum_order_size
     FROM markets m
     WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
       AND ${mTagWhere}
       AND m.question ~* 'vs\\.?'
       AND m.closed = false
     ORDER BY m.volume DESC
     LIMIT 100`,
    tagParams
  );

  // 3. Load sub-markets for event_groups
  const groupIds = egRows.map((r: any) => r.id);
  const allSubMarkets: Record<string, any[]> = {};

  if (groupIds.length > 0) {
    const { rows: subRows } = await pool.query(
      `SELECT m.id, m.event_group_id, m.question, m.group_item_title, m.slug,
         m.image_url, m.end_date_iso, m.volume, m.liquidity,
         m.active, m.closed, m.condition_id, m.minimum_tick_size, m.minimum_order_size,
         m.polymarket_id, m.created_at, m.description
       FROM markets m WHERE m.event_group_id = ANY($1) AND m.closed = false
       ORDER BY m.created_at`,
      [groupIds]
    );
    for (const r of subRows) {
      if (!allSubMarkets[r.event_group_id]) allSubMarkets[r.event_group_id] = [];
      allSubMarkets[r.event_group_id].push(r);
    }
  }

  // 4. Load tokens for all market IDs
  const allMarketIds = [
    ...Object.values(allSubMarkets).flat().map(m => m.id),
    ...standaloneRows.map((r: any) => r.id),
  ];
  const tokensByMarket = await loadTokens(allMarketIds);

  // 5. Convert event_groups to PMEvent, filter, and build EventGroups
  const rawEvents: EventGroup[] = [];

  for (const eg of egRows) {
    const marketRows = allSubMarkets[eg.id] || [];
    if (marketRows.length === 0) continue;

    const pmEvent = toPMEvent(eg, marketRows, tokensByMarket);

    // Filter out settled matches
    if (isMatchSettled(pmEvent)) continue;

    const matchInfo = buildMatchInfo(pmEvent);
    if (!matchInfo) continue;

    // Convert sub-markets: moneyline first, then others
    const nonPlaceholder = pmEvent.markets.filter(m => !isPlaceholderMarket(m));
    const moneyline = nonPlaceholder.find(m =>
      !m.groupItemTitle && m.question === pmEvent.title
    ) || nonPlaceholder.find(m =>
      m.groupItemTitle === 'Match Winner' || m.question === 'Match Winner'
    ) || nonPlaceholder.find(m =>
      /moneyline/i.test(m.groupItemTitle || '')
    );
    const others = nonPlaceholder.filter(m => m !== moneyline).slice(0, moneyline ? 2 : 3);
    const orderedMarkets = moneyline ? [moneyline, ...others] : others;
    const mappedMarkets = orderedMarkets.map(m => mapToMarket(pmEvent, m));

    rawEvents.push({
      id: pmEvent.id,
      title: pmEvent.title,
      slug: pmEvent.slug,
      description: pmEvent.description || null,
      category: pmEvent.tags?.[0]?.label || 'Sports',
      tags: pmEvent.tags?.map(t => ({ slug: t.slug, label: t.label })) || [],
      image_url: pmEvent.image || null,
      end_date_iso: pmEvent.endDate || null,
      volume: pmEvent.volume || 0,
      liquidity: pmEvent.liquidity || 0,
      created_at: pmEvent.createdAt || pmEvent.creationDate || new Date().toISOString(),
      markets: mappedMarkets,
      match: matchInfo,
    });
  }

  // 6. Add standalone matches
  for (const m of standaloneRows) {
    const tokens = tokensByMarket[m.id] || [];
    const matchInfo = buildStandaloneMatch(m, tokens);
    if (!matchInfo) continue;

    rawEvents.push({
      id: m.id,
      title: m.question,
      slug: m.slug,
      description: null,
      category: m.category || 'Sports',
      tags: (m.tags || []).map((t: any) => ({ slug: t.slug, label: t.label })),
      image_url: m.image_url || null,
      end_date_iso: m.end_date_iso || null,
      volume: parseFloat(m.volume) || 0,
      liquidity: parseFloat(m.liquidity) || 0,
      created_at: m.created_at,
      markets: [buildSingleMarket(m, tokens)],
      match: matchInfo,
    });
  }

  // 7. Merge event_groups for the same physical match
  const events = mergeMatchEvents(rawEvents);

  const total = events.length;
  const trimmed = events.slice(offset, offset + limit);
  const hasMore = offset + trimmed.length < total;

  // Build taxonomy only on first page
  let taxonomy: TaxonomyItem[] | undefined;
  if (offset === 0) {
    taxonomy = await buildTaxonomyFromDB();
  }

  return NextResponse.json(
    { events: trimmed, hasMore, total, ...(taxonomy ? { taxonomy } : {}) },
    { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' } }
  );
}

// ═══════════════════════════════════════════════════
//  FUTURES (tab=futures)
// ═══════════════════════════════════════════════════

async function handleFutures(tagWhere: string, tagParams: any[], paramIdx: number, offset: number, limit: number) {
  // Count
  const { rows: [{ count: totalStr }] } = await pool.query(
    `SELECT COUNT(*) as count FROM event_groups t
     WHERE t.polymarket_id IS NOT NULL AND ${tagWhere}
       AND t.title !~* 'vs\\.?'
       AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = t.id AND m.closed = false)`,
    tagParams
  );
  // Also count standalone futures
  const { rows: [{ count: mCountStr }] } = await pool.query(
    `SELECT COUNT(*) as count FROM markets t
     WHERE t.polymarket_id IS NOT NULL AND t.event_group_id IS NULL AND ${tagWhere}
       AND t.question !~* 'vs\\.?'
       AND t.closed = false`,
    tagParams
  );
  const total = parseInt(totalStr) + parseInt(mCountStr);

  // Fetch event group futures
  const { rows: futRows } = await pool.query(
    `SELECT eg.id, eg.title, eg.slug, eg.category, eg.tags,
       eg.image_url, eg.end_date_iso, eg.volume, eg.volume_24hr, eg.liquidity,
       eg.neg_risk, eg.created_at, eg.polymarket_id
     FROM event_groups eg
     WHERE eg.polymarket_id IS NOT NULL
       AND (${tagWhere.replace(/t\./g, 'eg.')})
       AND eg.title !~* 'vs\\.?'
       AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
     ORDER BY eg.volume DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...tagParams, limit, offset]
  );

  // Batch load sub-markets + tokens for futures
  const groupIds = futRows.map((r: any) => r.id);
  const allSubMarkets: Record<string, any[]> = {};

  if (groupIds.length > 0) {
    const { rows: subRows } = await pool.query(
      `SELECT m.id, m.event_group_id, m.question, m.group_item_title, m.slug,
         m.image_url, m.end_date_iso, m.volume, m.liquidity,
         m.active, m.closed, m.condition_id, m.minimum_tick_size, m.minimum_order_size,
         m.polymarket_id, m.created_at
       FROM markets m WHERE m.event_group_id = ANY($1) AND m.closed = false
       ORDER BY m.created_at`,
      [groupIds]
    );
    for (const r of subRows) {
      if (!allSubMarkets[r.event_group_id]) allSubMarkets[r.event_group_id] = [];
      allSubMarkets[r.event_group_id].push(r);
    }
  }

  // Fetch standalone market futures (single-market events with no event_group)
  const standaloneOffset = Math.max(0, offset - parseInt(totalStr));
  const standaloneLimit = limit;
  const { rows: mRows } = offset < total ? await pool.query(
    `SELECT m.id, m.question, m.slug, m.category, m.tags,
       m.image_url, m.end_date_iso, m.volume, m.volume_24hr, m.liquidity,
       m.neg_risk, m.created_at, m.active, m.closed, m.polymarket_id,
       m.condition_id, m.minimum_tick_size, m.minimum_order_size
     FROM markets m
     WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
       AND (${tagWhere.replace(/t\./g, 'm.')})
       AND m.question !~* 'vs\\.?'
       AND m.closed = false
     ORDER BY m.volume DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...tagParams, standaloneLimit, Math.max(0, standaloneOffset)]
  ) : { rows: [] };

  // Combine market IDs for token loading
  const allMarketIds = [
    ...Object.values(allSubMarkets).flat().map(m => m.id),
    ...mRows.map((r: any) => r.id),
  ];
  const tokensByMarket = await loadTokens(allMarketIds);

  const events: EventGroup[] = [];
  for (const eg of futRows) {
    const marketRows = allSubMarkets[eg.id] || [];
    if (marketRows.length === 0) continue;

    // Sort by Yes price desc, top 10
    const sorted = marketRows.sort((a: any, b: any) => {
      const aP = (tokensByMarket[a.id] || []).find((t: Token) => t.outcome === 'Yes')?.price ?? 0;
      const bP = (tokensByMarket[b.id] || []).find((t: Token) => t.outcome === 'Yes')?.price ?? 0;
      return bP - aP;
    });

    events.push({
      id: eg.id, title: eg.title, slug: eg.slug,
      description: null, category: eg.category, tags: eg.tags || [],
      image_url: eg.image_url || null, end_date_iso: eg.end_date_iso || null,
      volume: parseFloat(eg.volume) || 0, liquidity: parseFloat(eg.liquidity) || 0,
      created_at: eg.created_at,
      markets: buildMarketArray(eg, sorted.slice(0, 10), tokensByMarket),
    });
    if (events.length >= limit) break;
  }

  // Add standalone market futures if we need more
  if (events.length < limit) {
    for (const m of mRows) {
      const tokens = tokensByMarket[m.id] || [];
      events.push({
        id: m.id, title: m.question, slug: m.slug,
        description: null, category: m.category, tags: m.tags || [],
        image_url: m.image_url || null, end_date_iso: m.end_date_iso || null,
        volume: parseFloat(m.volume) || 0, liquidity: parseFloat(m.liquidity) || 0,
        created_at: m.created_at,
        markets: [buildSingleMarket(m, tokens)],
      });
      if (events.length >= limit) break;
    }
  }

  let taxonomy: TaxonomyItem[] | undefined;
  if (offset === 0) {
    taxonomy = await buildTaxonomyFromDB();
  }

  const hasMore = offset + events.length < total;

  return NextResponse.json(
    { events, hasMore, total, ...(taxonomy ? { taxonomy } : {}) },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } }
  );
}

// ═══════════════════════════════════════════════════
//  Taxonomy — built from DB counts, not from events
// ═══════════════════════════════════════════════════

const PARENT_SPORTS: Record<string, string> = {
  basketball: 'Basketball', soccer: 'Soccer', esports: 'Esports',
  tennis: 'Tennis', hockey: 'Hockey', cricket: 'Cricket',
  baseball: 'Baseball', football: 'Football', rugby: 'Rugby',
  ufc: 'UFC', boxing: 'Boxing', golf: 'Golf', f1: 'Formula 1',
  chess: 'Chess', 'table-tennis': 'Table Tennis',
  pickleball: 'Pickleball', lacrosse: 'Lacrosse',
};

const META_TAGS = new Set([
  'sports', 'esports', 'games', 'hide-from-new', 'speculation',
  'pop-culture', 'celebrities', 'politics', 'trump', 'geopolitics',
  'business', 'economy', 'parlays', 'music', 'streaming',
  'ukraine', 'russia', 'peace', 'putin', 'zelenskyy',
  'ukraine-peace-deal', 'china', 'olympics', 'skiing',
  'all', 'featured', 'todays-sports', 'internet-culture',
  'crypto', 'cryptocurrency', 'fight', 'boxingmma', 'combats',
  'netflix', 'twitter', 'x', 'solana', 'sol', 'memecoins',
]);

interface TaxonomyItem {
  slug: string;
  label: string;
  count: number;
  leagues: { slug: string; label: string; count: number }[];
}

async function buildTaxonomyFromDB(): Promise<TaxonomyItem[]> {
  // Build root condition matching any parent sport or sports/esports meta tag
  const rootCond = [
    'sports', 'esports', ...Object.keys(PARENT_SPORTS),
  ].map(s => `tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ');

  // Get all tag pairs from active sports events
  const { rows } = await pool.query(`
    SELECT t_elem->>'slug' as slug, t_elem->>'label' as label, COUNT(*) as cnt
    FROM (
      SELECT eg.id, jsonb_array_elements(eg.tags) as t_elem
      FROM event_groups eg
      WHERE eg.polymarket_id IS NOT NULL
        AND (${rootCond})
        AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
      UNION ALL
      SELECT m.id, jsonb_array_elements(m.tags) as t_elem
      FROM markets m
      WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
        AND (${rootCond})
        AND m.closed = false
    ) sub
    GROUP BY slug, label
    ORDER BY cnt DESC
  `);

  // Find parent sports and their counts
  const sportCounts: Record<string, { label: string; count: number }> = {};
  const allTags: Record<string, { label: string; count: number }> = {};
  for (const r of rows) {
    const slug = r.slug.toLowerCase();
    allTags[slug] = { label: r.label, count: parseInt(r.cnt) };
    if (PARENT_SPORTS[slug]) {
      sportCounts[slug] = { label: PARENT_SPORTS[slug], count: parseInt(r.cnt) };
    }
  }

  // For each parent sport, find league tags via co-occurrence
  const result: TaxonomyItem[] = [];

  for (const [sport, { label, count }] of Object.entries(sportCounts)) {
    // Get tags that co-occur with this sport
    const { rows: coRows } = await pool.query(`
      SELECT t2->>'slug' as slug, t2->>'label' as label, COUNT(*) as cnt
      FROM (
        SELECT eg.id, jsonb_array_elements(eg.tags) as t2
        FROM event_groups eg
        WHERE eg.polymarket_id IS NOT NULL
          AND eg.tags @> $1::jsonb
          AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
        UNION ALL
        SELECT m.id, jsonb_array_elements(m.tags) as t2
        FROM markets m
        WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
          AND m.tags @> $1::jsonb
          AND m.closed = false
      ) sub
      GROUP BY slug, label
      HAVING COUNT(*) >= 2
      ORDER BY cnt DESC
    `, [JSON.stringify([{ slug: sport }])]);

    const leagues: { slug: string; label: string; count: number }[] = [];
    for (const r of coRows) {
      const s = r.slug.toLowerCase();
      if (s === sport || META_TAGS.has(s) || PARENT_SPORTS[s]) continue;
      leagues.push({ slug: s, label: r.label, count: parseInt(r.cnt) });
    }

    result.push({ slug: sport, label, count, leagues });
  }

  result.sort((a, b) => b.count - a.count);
  return result;
}

// ═══════════════════════════════════════════════════
//  Match merging — combine event_groups for same physical match
// ═══════════════════════════════════════════════════

/** Extract base slug: strip suffix after date pattern (YYYY-MM-DD) */
function getBaseSlug(slug: string): string {
  const m = slug.match(/^(.+?-\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : slug;
}

/** Merge event_groups that share the same base slug into one EventGroup */
function mergeMatchEvents(events: EventGroup[]): EventGroup[] {
  const byBase: Record<string, EventGroup[]> = {};
  for (const ev of events) {
    const base = getBaseSlug(ev.slug);
    if (!byBase[base]) byBase[base] = [];
    byBase[base].push(ev);
  }

  const merged: EventGroup[] = [];
  for (const group of Object.values(byBase)) {
    // Sort: shortest slug first (base match = primary)
    group.sort((a: EventGroup, b: EventGroup) => a.slug.length - b.slug.length);
    const primary = group[0];

    if (group.length > 1 && primary.match) {
      for (let i = 1; i < group.length; i++) {
        const sec = group[i];
        primary.volume += sec.volume;

        // Merge sub-markets into primary's markets array
        if (sec.markets?.length) {
          primary.markets.push(...sec.markets);
        }

        // Merge market_types from secondary's match info
        if (sec.match?.market_types) {
          // Derive context label from the slug suffix
          const secBase = getBaseSlug(sec.slug);
          const suffix = sec.slug.slice(secBase.length + 1); // e.g., "more-markets", "halftime-result"
          const suffixLabel = suffix
            ? suffix.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            : '';

          for (const mt of sec.match.market_types) {
            // Prefix label with context to avoid confusion (e.g., "Halftime Result: Winner")
            if (suffixLabel) {
              mt.label = `${suffixLabel}: ${mt.label}`;
            }
            primary.match.market_types.push(mt);
          }
        }
      }
      // Update game_views to reflect total market types
      primary.match.game_views = primary.match.market_types.length;
    }

    merged.push(primary);
  }

  return merged;
}

// ═══════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════

async function loadTokens(marketIds: string[]): Promise<Record<string, Token[]>> {
  const tokensByMarket: Record<string, Token[]> = {};
  if (marketIds.length === 0) return tokensByMarket;

  const { rows: tokenRows } = await pool.query(
    `SELECT market_id, token_id, outcome, price, label FROM tokens WHERE market_id = ANY($1)`,
    [marketIds]
  );
  for (const t of tokenRows) {
    if (!tokensByMarket[t.market_id]) tokensByMarket[t.market_id] = [];
    tokensByMarket[t.market_id].push({
      id: t.token_id, token_id: t.token_id,
      outcome: t.outcome, price: parseFloat(t.price),
      label: t.label || undefined,
    });
  }
  return tokensByMarket;
}

function buildMarketArray(eg: any, marketRows: any[], tokensByMarket: Record<string, Token[]>) {
  return marketRows.map((m: any) => ({
    id: m.id, condition_id: m.condition_id || '', question_id: '',
    question: m.question, group_item_title: m.group_item_title || undefined,
    description: null, category: eg.category, tags: [], slug: m.slug,
    image_url: m.image_url || eg.image_url || null, resolution_source: null,
    tokens: tokensByMarket[m.id] || [],
    minimum_tick_size: parseFloat(m.minimum_tick_size) || 0.01,
    minimum_order_size: parseFloat(m.minimum_order_size) || 5,
    active: m.active, closed: m.closed, resolved: false,
    winning_outcome: null, resolved_at: null, accepting_orders: m.active,
    end_date_iso: m.end_date_iso || null,
    volume: parseFloat(m.volume) || 0, volume_24hr: 0,
    liquidity: parseFloat(m.liquidity) || 0,
    neg_risk: eg.neg_risk || false, created_at: m.created_at,
  }));
}

function buildSingleMarket(m: any, tokens: Token[]) {
  return {
    id: m.id, condition_id: '', question_id: '', question: m.question,
    description: null, category: m.category, tags: [], slug: m.slug,
    image_url: m.image_url || null, resolution_source: null, tokens,
    minimum_tick_size: 0.01, minimum_order_size: 5,
    active: m.active, closed: m.closed, resolved: false,
    winning_outcome: null, resolved_at: null, accepting_orders: m.active,
    end_date_iso: m.end_date_iso || null,
    volume: parseFloat(m.volume) || 0, volume_24hr: parseFloat(m.volume_24hr) || 0,
    liquidity: parseFloat(m.liquidity) || 0,
    neg_risk: m.neg_risk || false, created_at: m.created_at,
  };
}

function toPMEvent(eg: any, marketRows: any[], tokensByMarket: Record<string, Token[]>): PMEvent {
  return {
    id: eg.polymarket_id || eg.id, ticker: eg.slug, slug: eg.slug,
    title: eg.title, description: eg.description || '',
    endDate: eg.end_date_iso || '', startDate: eg.created_at || '',
    creationDate: eg.created_at || '', image: eg.image_url || '', icon: '',
    active: !marketRows.every((m: any) => m.closed),
    closed: marketRows.every((m: any) => m.closed),
    liquidity: parseFloat(eg.liquidity) || 0,
    volume: parseFloat(eg.volume) || 0, volume24hr: parseFloat(eg.volume_24hr) || 0,
    volume1wk: 0, volume1mo: 0, commentCount: 0,
    negRisk: eg.neg_risk || false, competitive: 0,
    tags: (eg.tags || []).map((t: any) => ({ id: t.slug, label: t.label, slug: t.slug })),
    markets: marketRows.map((m: any): PMMarket => {
      const tokens = tokensByMarket[m.id] || [];
      const yesToken = tokens.find(t => t.outcome === 'Yes');
      const noToken = tokens.find(t => t.outcome === 'No');
      return {
        id: m.polymarket_id || m.id, question: m.question,
        conditionId: m.condition_id || '', slug: m.slug, resolutionSource: '',
        endDate: m.end_date_iso || '', startDate: m.created_at || '',
        image: m.image_url || '', icon: '', description: m.description || '',
        outcomes: [yesToken?.label || 'Yes', noToken?.label || 'No'],
        outcomePrices: [String(yesToken?.price ?? 0.5), String(noToken?.price ?? 0.5)],
        volume: String(m.volume || 0), active: m.active, closed: m.closed,
        clobTokenIds: tokens.map(t => t.token_id), groupItemTitle: m.group_item_title || '',
        liquidity: String(m.liquidity || 0),
        orderPriceMinTickSize: parseFloat(m.minimum_tick_size) || 0.01,
        orderMinSize: parseFloat(m.minimum_order_size) || 5,
        bestBid: 0, bestAsk: 0, lastTradePrice: 0, spread: 0,
      };
    }),
    createdAt: eg.created_at || '', updatedAt: '',
  };
}

function buildStandaloneMatch(mRow: any, tokens: Token[]): MatchInfo | null {
  const title: string = mRow.question || '';
  const vsMatch = title.match(/^(?:.+?:\s+)?(.+?)\s+vs\.?\s+(.+?)$/i);
  if (!vsMatch) return null;

  const team1Name = vsMatch[1].trim();
  const team2Name = vsMatch[2].replace(/\s*\([^)]*\)\s*$/, '').trim();
  const yesToken = tokens.find(t => t.outcome === 'Yes');
  const noToken = tokens.find(t => t.outcome === 'No');

  const slugParts = (mRow.slug || '').split('-');
  let abbr1 = team1Name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 3);
  let abbr2 = team2Name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 3);
  if (slugParts.length >= 3) {
    abbr1 = slugParts[1]?.toUpperCase() || abbr1;
    abbr2 = slugParts[2]?.toUpperCase() || abbr2;
  }

  const tags = (mRow.tags || []).map((t: any) => t.slug);
  const league = deriveLeague(tags);
  const endDate = new Date(mRow.end_date_iso || '');
  let status: 'upcoming' | 'live' | 'final' = 'upcoming';
  if (mRow.closed) status = 'final';
  else if (endDate < new Date()) status = 'live';

  return {
    team1: { name: team1Name, abbr: abbr1, logo: '' },
    team2: { name: team2Name, abbr: abbr2, logo: '' },
    event_image: mRow.image_url || '', league,
    start_time: mRow.end_date_iso || mRow.created_at || '', status,
    market_types: [{
      id: 'moneyline', tab: 'game-lines', label: 'Moneyline',
      volume: parseFloat(mRow.volume) || 0,
      markets: [
        { id: `${mRow.id}-0`, label: team1Name, price: yesToken?.price ?? 0.5 },
        { id: `${mRow.id}-1`, label: team2Name, price: noToken?.price ?? 0.5 },
      ],
    }],
  };
}

function deriveLeague(tags: string[]): string {
  const map: Record<string, string> = {
    nba: 'NBA', nhl: 'NHL', nfl: 'NFL', mlb: 'MLB', epl: 'EPL', ucl: 'UCL',
    'la-liga': 'La Liga', soccer: 'Soccer', tennis: 'Tennis', cricket: 'Cricket',
    golf: 'Golf', ufc: 'UFC', boxing: 'Boxing', chess: 'Chess', f1: 'F1',
    'league-of-legends': 'LoL', 'counter-strike-2': 'CS2', 'dota-2': 'Dota 2',
    valorant: 'Valorant', esports: 'Esports', baseball: 'Baseball', hockey: 'Hockey',
    rugby: 'Rugby', 'united-rugby-championship': 'URC', 'rugby-premiership': 'Premiership Rugby',
    ncaa: 'NCAA', 'ncaa-basketball': 'NCAA Basketball', nbl: 'NBL', kbl: 'KBL', lnb: 'LNB',
    'basketball-champions-league': 'BCL', 'table-tennis': 'Table Tennis', 'ping-pong': 'Table Tennis',
    wbc: 'WBC',
  };
  for (const t of tags) { if (map[t]) return map[t]; }
  return 'Sports';
}
