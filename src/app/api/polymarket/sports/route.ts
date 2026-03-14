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

    // Hybrid filter: category OR root sport/esport tag (covers events with stale category)
    const SPORT_ROOT_CONDITION = `(t.category = 'Sports' OR t.tags @> '[{"slug":"sports"}]'::jsonb OR t.tags @> '[{"slug":"esports"}]'::jsonb)`;

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
  const now = new Date();
  const isPast = endDate ? endDate < now : false;
  const hoursPast = endDate ? (now.getTime() - endDate.getTime()) / (1000 * 60 * 60) : 0;

  // Hard cutoff: any match > 3 hours past its end_date is over
  if (hoursPast > 3) return true;

  // Low-volume matches past their end date are dead
  const totalVol = ev.volume ? parseFloat(String(ev.volume)) : 0;
  if (isPast && totalVol < 500) return true;

  // For esports: always check settlement (they can settle mid-match)
  // For traditional sports: only check if end date has passed
  const isEsports = ev.tags?.some(t => ESPORTS_TAGS.has(t.slug));
  if (!isEsports && !isPast) return false;

  // Tighter threshold for older matches
  const threshold = hoursPast > 1 ? 0.88 : 0.95;

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
        return (p1 >= threshold || p1 <= (1 - threshold)) && (p2 >= threshold || p2 <= (1 - threshold));
      }
    }
    // Fallback: if end date is past and ALL sub-markets are settled, treat as done
    if (isPast && markets.length > 0) {
      const allSettled = markets.every(m => {
        const p = parseFloat(parseField(m.outcomePrices)[0] || '0.5');
        return p >= threshold || p <= (1 - threshold);
      });
      if (allSettled) return true;
    }
    return false;
  }
  const prices = parseField(mw.outcomePrices);
  if (prices.length < 2) return false;
  const p0 = parseFloat(prices[0] || '0.5');
  return p0 >= threshold || p0 <= (1 - threshold);
}

/** Check if a market is a placeholder (no price data) */
function isPlaceholderMarket(pm: PMMarket): boolean {
  return parseField(pm.outcomePrices).length === 0;
}

const GAMMA_API = 'https://gamma-api.polymarket.com';

/** Fetch live sports directly from Polymarket's Gamma API (real-time, same data as polymarket.com/sports) */
async function fetchFromGammaAPI(limit: number): Promise<Response | null> {
  try {
    const now = new Date();
    // Fetch events ending within the next 24 hours (covers live + starting soon)
    const minEnd = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
    const params = (tag: string) => new URLSearchParams({
      active: 'true', closed: 'false', tag_slug: tag,
      order: 'endDate', ascending: 'true',
      end_date_min: minEnd, limit: '100',
    });

    const [sportsRes, esportsRes] = await Promise.all([
      fetch(`${GAMMA_API}/events?${params('sports')}`, {
        cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${GAMMA_API}/events?${params('esports')}`, {
        cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    if (!sportsRes.ok && !esportsRes.ok) return null;

    const sportsEvents: PMEvent[] = sportsRes.ok ? await sportsRes.json() : [];
    const esportsEvents: PMEvent[] = esportsRes.ok ? await esportsRes.json() : [];

    // Deduplicate by ID
    const seen = new Set<string>();
    const allEvents: PMEvent[] = [];
    for (const ev of [...sportsEvents, ...esportsEvents]) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      // Only "vs" matches
      if (!/vs\.?/i.test(ev.title)) continue;
      allEvents.push(ev);
    }

    // Process through existing pipeline
    const rawEvents: EventGroup[] = [];
    for (const ev of allEvents) {
      if (ev.closed) continue;
      if (isMatchSettled(ev)) continue;
      const matchInfo = buildMatchInfo(ev);
      if (!matchInfo || matchInfo.status === 'final') continue;

      const nonPlaceholder = (ev.markets || []).filter(m => !isPlaceholderMarket(m));
      const moneyline = nonPlaceholder.find(m =>
        !m.groupItemTitle && m.question === ev.title
      ) || nonPlaceholder.find(m =>
        m.groupItemTitle === 'Match Winner' || m.question === 'Match Winner'
      ) || nonPlaceholder.find(m =>
        /moneyline/i.test(m.groupItemTitle || '')
      );
      const others = nonPlaceholder.filter(m => m !== moneyline).slice(0, moneyline ? 2 : 3);
      const orderedMarkets = moneyline ? [moneyline, ...others] : others;
      const mappedMarkets = orderedMarkets.map(m => mapToMarket(ev, m));

      rawEvents.push({
        id: ev.id, title: ev.title, slug: ev.slug,
        description: null,
        category: ev.tags?.[0]?.label || 'Sports',
        tags: ev.tags?.map(t => ({ slug: t.slug, label: t.label })) || [],
        image_url: ev.image || null, end_date_iso: ev.endDate || null,
        volume: ev.volume || 0, liquidity: ev.liquidity || 0,
        created_at: ev.createdAt || ev.creationDate || new Date().toISOString(),
        markets: mappedMarkets.map(m => ({ ...m, description: null })),
        match: matchInfo,
      });
    }

    const merged = mergeMatchEvents(rawEvents);
    // Sort by endDate ASC — same as Polymarket
    merged.sort((a, b) => {
      const aLive = a.match?.status === 'live' ? 0 : 1;
      const bLive = b.match?.status === 'live' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      const aTime = new Date(a.end_date_iso || '').getTime();
      const bTime = new Date(b.end_date_iso || '').getTime();
      return aTime - bTime;
    });

    const events = merged;
    const total = events.length;
    const trimmed = events.slice(0, limit);
    const hasMore = trimmed.length < total;
    const taxonomy = await buildTaxonomyFromDB();
    const topLeagueOrder = taxonomy ? await getTopLeagueOrder() : null;

    return NextResponse.json(
      { events: trimmed, hasMore, total, ...(taxonomy ? { taxonomy } : {}), ...(topLeagueOrder ? { topLeagueOrder } : {}) },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
    );
  } catch (err) {
    console.error('[sports] Gamma API fetch failed:', err);
    return null;
  }
}

async function handleMatches(offset: number, limit: number, sportFilter: string, leagueFilter: string) {
  // PRIMARY: Fetch directly from Polymarket's Gamma API (real-time data)
  if (!sportFilter && !leagueFilter && offset === 0) {
    const gammaResult = await fetchFromGammaAPI(limit);
    if (gammaResult) return gammaResult;
  }

  // FALLBACK: Use DB cache if Gamma API fails
  if (!sportFilter && !leagueFilter && offset === 0) {
    try {
      const { rows: cacheRows } = await pool.query(
        `SELECT data FROM api_cache WHERE key = 'sports_live' AND updated_at > NOW() - INTERVAL '15 minutes'`
      );
      if (cacheRows.length > 0) {
        const cached = cacheRows[0].data;
        const result = await buildFromCache(cached, limit);
        if (result) return result;
      }
    } catch { /* fall through to live queries */ }
  }

  // Hybrid filter: category OR root sport/esport tag (covers events with stale category)
  const SPORT_ROOT_CONDITION_EG = `(eg.category = 'Sports' OR eg.tags @> '[{"slug":"sports"}]'::jsonb OR eg.tags @> '[{"slug":"esports"}]'::jsonb)`;
  const SPORT_ROOT_CONDITION_M = `(m.category = 'Sports' OR m.tags @> '[{"slug":"sports"}]'::jsonb OR m.tags @> '[{"slug":"esports"}]'::jsonb)`;

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

  // 1+2. Query event_groups and standalone markets in parallel
  const taxonomyPromise = offset === 0 ? buildTaxonomyFromDB() : Promise.resolve(undefined);

  const [{ rows: egRows }, { rows: standaloneRows }] = await Promise.all([
    pool.query(
      `SELECT eg.id, eg.title, eg.slug, eg.description, eg.category, eg.tags,
         eg.image_url, eg.end_date_iso, eg.volume, eg.volume_24hr, eg.liquidity,
         eg.neg_risk, eg.created_at, eg.polymarket_id
       FROM event_groups eg
       WHERE eg.polymarket_id IS NOT NULL
         AND ${egTagWhere}
         AND eg.title ~* 'vs\\.?'
         AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
         AND (eg.end_date_iso IS NULL OR eg.end_date_iso::timestamptz > NOW() - INTERVAL '3 hours')
       ORDER BY eg.end_date_iso ASC NULLS LAST
       LIMIT 300`,
      tagParams
    ),
    pool.query(
      `SELECT m.id, m.question, m.slug, m.category, m.tags,
         m.image_url, m.end_date_iso, m.volume, m.volume_24hr, m.liquidity,
         m.neg_risk, m.created_at, m.active, m.closed, m.polymarket_id,
         m.condition_id, m.minimum_tick_size, m.minimum_order_size
       FROM markets m
       WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
         AND ${mTagWhere}
         AND m.question ~* 'vs\\.?'
         AND m.closed = false
         AND (m.end_date_iso IS NULL OR m.end_date_iso::timestamptz > NOW() - INTERVAL '3 hours')
       ORDER BY m.end_date_iso ASC NULLS LAST
       LIMIT 100`,
      tagParams
    ),
  ]);

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
    if (!matchInfo || matchInfo.status === 'final') continue;

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
      description: null,
      category: pmEvent.tags?.[0]?.label || 'Sports',
      tags: pmEvent.tags?.map(t => ({ slug: t.slug, label: t.label })) || [],
      image_url: pmEvent.image || null,
      end_date_iso: pmEvent.endDate || null,
      volume: pmEvent.volume || 0,
      liquidity: pmEvent.liquidity || 0,
      created_at: pmEvent.createdAt || pmEvent.creationDate || new Date().toISOString(),
      markets: mappedMarkets.map(m => ({ ...m, description: null })),
      match: matchInfo,
    });
  }

  // 6. Add standalone matches
  for (const m of standaloneRows) {
    const tokens = tokensByMarket[m.id] || [];
    const matchInfo = buildStandaloneMatch(m, tokens);
    if (!matchInfo || matchInfo.status === 'final') continue;

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
  const merged = mergeMatchEvents(rawEvents);

  // 8. Sort: live first by volume DESC, then upcoming by start_time ASC
  // Sort: live first by start_time ASC (soonest/most recent), then upcoming by start_time ASC
  merged.sort((a, b) => {
    const aLive = a.match?.status === 'live' ? 0 : 1;
    const bLive = b.match?.status === 'live' ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    const aTime = new Date(a.match?.start_time || a.end_date_iso || '').getTime();
    const bTime = new Date(b.match?.start_time || b.end_date_iso || '').getTime();
    return aTime - bTime;
  });
  const events = merged;

  const total = events.length;
  const trimmed = events.slice(offset, offset + limit);
  const hasMore = offset + trimmed.length < total;

  // Taxonomy was started in parallel at the top — await it now
  const taxonomy = await taxonomyPromise;
  const topLeagueOrder = taxonomy ? await getTopLeagueOrder() : null;

  const responseData = { events: trimmed, hasMore, total, ...(taxonomy ? { taxonomy } : {}), ...(topLeagueOrder ? { topLeagueOrder } : {}) };

  // Cache slimmed response for edge endpoint (unfiltered first page only)
  if (!sportFilter && !leagueFilter && offset === 0) {
    await writeSlimCache(trimmed, hasMore, total, taxonomy).catch(e => console.error('[sports] slim cache write failed:', e));
  }

  return NextResponse.json(
    responseData,
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
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
  let topLeagueOrder: string[] | null = null;
  if (offset === 0) {
    taxonomy = await buildTaxonomyFromDB();
    topLeagueOrder = await getTopLeagueOrder();
  }

  const hasMore = offset + events.length < total;

  return NextResponse.json(
    { events, hasMore, total, ...(taxonomy ? { taxonomy } : {}), ...(topLeagueOrder ? { topLeagueOrder } : {}) },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } }
  );
}

// ═══════════════════════════════════════════════════
//  Taxonomy — built from DB counts, not from events
// ═══════════════════════════════════════════════════

// Fallback constants — only used if auto-taxonomy cache hasn't been computed yet
const FALLBACK_PARENT_SPORTS: Record<string, string> = {
  basketball: 'Basketball', soccer: 'Soccer', esports: 'Esports',
  tennis: 'Tennis', hockey: 'Hockey', cricket: 'Cricket',
  baseball: 'Baseball', football: 'Football', rugby: 'Rugby',
  ufc: 'UFC', boxing: 'Boxing', golf: 'Golf', f1: 'Formula 1',
  chess: 'Chess', 'table-tennis': 'Table Tennis',
  pickleball: 'Pickleball', lacrosse: 'Lacrosse',
};

const FALLBACK_LEAGUE_TO_SPORT: Record<string, string> = {
  nba: 'basketball', ncaab: 'basketball', wnba: 'basketball',
  nhl: 'hockey', khl: 'hockey',
  'counter-strike-2': 'esports', 'dota-2': 'esports', 'league-of-legends': 'esports',
  valorant: 'esports', 'honor-of-kings': 'esports', 'call-of-duty': 'esports',
  overwatch: 'esports', 'rocket-league': 'esports',
  mlb: 'baseball', nfl: 'football', ncaaf: 'football',
  epl: 'soccer', ucl: 'soccer', mls: 'soccer', 'la-liga': 'soccer',
  'serie-a': 'soccer', bundesliga: 'soccer',
  atp: 'tennis', wta: 'tennis',
  ipl: 'cricket', pga: 'golf',
};

interface TaxonomyItem {
  slug: string;
  label: string;
  count: number;
  volume: number;
  leagues: { slug: string; label: string; count: number; volume: number }[];
}

async function buildTaxonomyFromDB(): Promise<TaxonomyItem[]> {
  // Read auto-detected taxonomy from cache (computed by cron every 10 min)
  let parentSports: Record<string, string> = FALLBACK_PARENT_SPORTS;
  let leagueToSport: Record<string, string> = FALLBACK_LEAGUE_TO_SPORT;

  try {
    const { rows: cacheRows } = await pool.query(`SELECT data FROM api_cache WHERE key = 'sport_taxonomy_auto'`);
    if (cacheRows[0]?.data?.parentSports && Object.keys(cacheRows[0].data.parentSports).length > 0) {
      parentSports = cacheRows[0].data.parentSports;
      leagueToSport = cacheRows[0].data.leagueToSport;
    }
  } catch { /* use fallback */ }

  // Query tag counts from sports events (category-based, no hardcoded tag lists)
  const { rows } = await pool.query(`
    SELECT t->>'slug' as tag_slug, t->>'label' as tag_label,
           COUNT(DISTINCT sub.id) as cnt, SUM(sub.vol) as total_vol
    FROM (
      SELECT eg.id, eg.tags, COALESCE(eg.volume, 0)::numeric as vol
      FROM event_groups eg
      WHERE eg.polymarket_id IS NOT NULL
        AND (eg.category = 'Sports' OR eg.tags @> '[{"slug":"sports"}]'::jsonb OR eg.tags @> '[{"slug":"esports"}]'::jsonb)
        AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
      UNION ALL
      SELECT m.id, m.tags, COALESCE(m.volume, 0)::numeric as vol
      FROM markets m
      WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
        AND (m.category = 'Sports' OR m.tags @> '[{"slug":"sports"}]'::jsonb OR m.tags @> '[{"slug":"esports"}]'::jsonb)
        AND m.closed = false
    ) sub, jsonb_array_elements(sub.tags) as t
    GROUP BY tag_slug, tag_label
    ORDER BY total_vol DESC
  `);

  // Tag counts lookup
  const tagCounts: Record<string, { label: string; count: number; volume: number }> = {};
  for (const r of rows) {
    tagCounts[r.tag_slug.toLowerCase()] = {
      label: r.tag_label,
      count: parseInt(r.cnt),
      volume: parseFloat(r.total_vol) || 0,
    };
  }

  // Merge aliases: combine duplicate parent sports into canonical forms
  const ALIASES: Record<string, string> = { 'ping-pong': 'table-tennis' };
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (parentSports[alias] && parentSports[canonical]) {
      delete parentSports[alias];
      // Redirect leagues of alias to canonical
      for (const [league, parent] of Object.entries(leagueToSport)) {
        if (parent === alias) leagueToSport[league] = canonical;
      }
    }
  }

  // Build sport map from auto-detected taxonomy
  const sportMap: Record<string, { label: string; count: number; volume: number; leagues: { slug: string; label: string; count: number; volume: number }[] }> = {};

  for (const [slug, rawLabel] of Object.entries(parentSports)) {
    // Capitalize first letter of each word
    const label = rawLabel.replace(/\b\w/g, c => c.toUpperCase());
    sportMap[slug] = { label, count: 0, volume: 0, leagues: [] };
    if (tagCounts[slug]) {
      sportMap[slug].count = tagCounts[slug].count;
      sportMap[slug].volume = tagCounts[slug].volume;
    }
  }

  // Noise tags that aren't real leagues/competitions
  const NOISE_TAGS = new Set([
    'goalie', 'goalkeeper', 'red-card', 'yellow-card', 'assists', 'goals',
    'card', 'sea', 'awards', 'trade', 'mvp', 'conference-championship',
  ]);

  // Assign leagues to parent sports
  for (const [league, parentSport] of Object.entries(leagueToSport)) {
    if (NOISE_TAGS.has(league)) continue;
    if (!tagCounts[league] || !sportMap[parentSport]) continue;
    const tc = tagCounts[league];
    if (tc.count < 1) continue;

    sportMap[parentSport].leagues.push({
      slug: league, label: tc.label, count: tc.count, volume: tc.volume,
    });

    // Always accumulate league counts/volume into parent totals
    sportMap[parentSport].count += tc.count;
    sportMap[parentSport].volume += tc.volume;
  }

  // Deduplicate leagues: merge abbreviations into full names (e.g., cs2 → counter-strike-2)
  const LEAGUE_ALIASES: Record<string, string> = {
    cs2: 'counter-strike-2', lol: 'league-of-legends',
    'formula-1': 'f1', 'pga-tour': 'pga',
  };
  for (const sport of Object.values(sportMap)) {
    const bySlug = new Map<string, typeof sport.leagues[0]>();
    for (const lg of sport.leagues) {
      const canonical = LEAGUE_ALIASES[lg.slug] || lg.slug;
      const existing = bySlug.get(canonical);
      if (existing) {
        // Keep higher-volume entry, sum counts
        if (lg.volume > existing.volume) {
          lg.count += existing.count;
          bySlug.set(canonical, { ...lg, slug: canonical });
        } else {
          existing.count += lg.count;
        }
      } else {
        bySlug.set(canonical, { ...lg, slug: canonical });
      }
    }
    sport.leagues = Array.from(bySlug.values());
  }

  // Sort leagues within each sport by volume desc
  for (const sport of Object.values(sportMap)) {
    sport.leagues.sort((a, b) => b.volume - a.volume);
  }

  // Sort parent sports by Polymarket's scraped order (auto-updated by cron)
  // Fallback to hardcoded order if scrape hasn't run yet
  let sportOrderMap: Record<string, number> = {
    basketball: 1, soccer: 2, esports: 3, tennis: 4, cricket: 5,
    hockey: 6, rugby: 7, 'table-tennis': 8, ufc: 9, football: 10,
    golf: 11, formula1: 12, chess: 13, boxing: 14, pickleball: 15,
    lacrosse: 16, baseball: 17,
  };

  // Name → slug mapping for scraped sport names
  const NAME_TO_SLUG: Record<string, string> = {
    'basketball': 'basketball', 'soccer': 'soccer', 'esports': 'esports',
    'tennis': 'tennis', 'cricket': 'cricket', 'hockey': 'hockey',
    'rugby': 'rugby', 'table tennis': 'table-tennis', 'ufc': 'ufc',
    'football': 'football', 'golf': 'golf', 'formula 1': 'formula1',
    'chess': 'chess', 'boxing': 'boxing', 'pickleball': 'pickleball',
    'lacrosse': 'lacrosse', 'baseball': 'baseball',
  };

  try {
    const { rows: orderRows } = await pool.query(
      `SELECT data FROM api_cache WHERE key = 'polymarket_sport_order' AND updated_at > NOW() - INTERVAL '1 day'`
    );
    if (orderRows[0]?.data?.sportOrder?.length >= 3) {
      const scraped: Record<string, number> = {};
      const sportNames: string[] = orderRows[0].data.sportOrder;
      sportNames.forEach((name: string, i: number) => {
        const slug = NAME_TO_SLUG[name.toLowerCase()] || name.toLowerCase().replace(/\s+/g, '-');
        scraped[slug] = i + 1;
      });
      sportOrderMap = scraped;
    }
  } catch { /* use fallback */ }

  return Object.entries(sportMap)
    .filter(([, v]) => v.count > 0)
    .map(([slug, v]) => ({ slug, label: v.label, count: v.count, volume: v.volume, leagues: v.leagues }))
    .sort((a, b) => {
      const oa = sportOrderMap[a.slug] ?? 100;
      const ob = sportOrderMap[b.slug] ?? 100;
      if (oa !== ob) return oa - ob;
      return b.volume - a.volume;
    });
}

/** Read top league order scraped from Polymarket (cached by cron) */
async function getTopLeagueOrder(): Promise<string[] | null> {
  try {
    const { rows } = await pool.query(
      `SELECT data FROM api_cache WHERE key = 'polymarket_sport_order' AND updated_at > NOW() - INTERVAL '1 day'`
    );
    if (rows[0]?.data?.topLeagues?.length >= 2) return rows[0].data.topLeagues;
  } catch { /* skip */ }
  return null;
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
//  Cache → response builder (single DB read path)
// ═══════════════════════════════════════════════════

async function buildFromCache(cached: any, limit: number): Promise<NextResponse | null> {
  try {
    const { eventGroups, standaloneMarkets, subMarkets, tokens: tokenRows } = cached;
    if (!eventGroups || !Array.isArray(eventGroups)) return null;

    // Build tokensByMarket lookup
    const tokensByMarket: Record<string, Token[]> = {};
    for (const t of tokenRows || []) {
      if (!tokensByMarket[t.market_id]) tokensByMarket[t.market_id] = [];
      tokensByMarket[t.market_id].push({
        id: t.token_id, token_id: t.token_id,
        outcome: t.outcome, price: parseFloat(t.price),
        label: t.label || undefined,
      });
    }

    // Build subMarkets lookup
    const allSubMarkets: Record<string, any[]> = {};
    for (const r of subMarkets || []) {
      if (!allSubMarkets[r.event_group_id]) allSubMarkets[r.event_group_id] = [];
      allSubMarkets[r.event_group_id].push(r);
    }

    // Process event groups (same logic as handleMatches)
    const rawEvents: EventGroup[] = [];

    for (const eg of eventGroups) {
      // Hard skip: any event with end_date more than 3 hours ago
      if (eg.end_date_iso) {
        const hoursPast = (Date.now() - new Date(eg.end_date_iso).getTime()) / (1000 * 60 * 60);
        if (hoursPast > 3) continue;
      }

      const marketRows = allSubMarkets[eg.id] || [];
      if (marketRows.length === 0) continue;

      const pmEvent = toPMEvent(eg, marketRows, tokensByMarket);
      if (isMatchSettled(pmEvent)) continue;

      const matchInfo = buildMatchInfo(pmEvent);
      if (!matchInfo || matchInfo.status === 'final') continue;

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
        id: pmEvent.id, title: pmEvent.title, slug: pmEvent.slug,
        description: null,
        category: pmEvent.tags?.[0]?.label || 'Sports',
        tags: pmEvent.tags?.map(t => ({ slug: t.slug, label: t.label })) || [],
        image_url: pmEvent.image || null, end_date_iso: pmEvent.endDate || null,
        volume: pmEvent.volume || 0, liquidity: pmEvent.liquidity || 0,
        created_at: pmEvent.createdAt || pmEvent.creationDate || new Date().toISOString(),
        markets: mappedMarkets.map(m => ({ ...m, description: null })), match: matchInfo,
      });
    }

    // Process standalone markets
    for (const m of standaloneMarkets || []) {
      // Hard skip: any market with end_date more than 3 hours ago
      if (m.end_date_iso) {
        const hoursPast = (Date.now() - new Date(m.end_date_iso).getTime()) / (1000 * 60 * 60);
        if (hoursPast > 3) continue;
      }
      const mTokens = tokensByMarket[m.id] || [];
      const matchInfo = buildStandaloneMatch(m, mTokens);
      if (!matchInfo || matchInfo.status === 'final') continue;

      rawEvents.push({
        id: m.id, title: m.question, slug: m.slug,
        description: null, category: m.category || 'Sports',
        tags: (m.tags || []).map((t: any) => ({ slug: t.slug, label: t.label })),
        image_url: m.image_url || null, end_date_iso: m.end_date_iso || null,
        volume: parseFloat(m.volume) || 0, liquidity: parseFloat(m.liquidity) || 0,
        created_at: m.created_at,
        markets: [buildSingleMarket(m, mTokens)], match: matchInfo,
      });
    }

    const merged = mergeMatchEvents(rawEvents);
    // Sort: live first by volume DESC, then upcoming by start_time ASC
    // Sort: live first by start_time ASC (soonest/most recent), then upcoming by start_time ASC
    merged.sort((a, b) => {
      const aLive = a.match?.status === 'live' ? 0 : 1;
      const bLive = b.match?.status === 'live' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      const aTime = new Date(a.match?.start_time || a.end_date_iso || '').getTime();
      const bTime = new Date(b.match?.start_time || b.end_date_iso || '').getTime();
      return aTime - bTime;
    });
    const events = merged;
    const trimmed = events.slice(0, limit);
    const taxonomy = await buildTaxonomyFromDB();
    const hasMore = trimmed.length < events.length;
    const total = events.length;

    // Write slimmed data to sports_processed for edge endpoint
    await writeSlimCache(trimmed, hasMore, total, taxonomy).catch(e => console.error('[sports] slim cache write failed:', e));

    return NextResponse.json(
      { events: trimmed, hasMore, total, ...(taxonomy ? { taxonomy } : {}) },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch {
    return null; // Fall through to live queries
  }
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

/** Write slimmed event data to api_cache for the edge endpoint */
async function writeSlimCache(events: EventGroup[], hasMore: boolean, total: number, taxonomy?: TaxonomyItem[]) {
  const slimEvents = events.map(e => ({
    ...e,
    description: null,
    tags: e.tags?.slice(0, 3) || [],
    markets: (e.markets || []).map(m => ({
      id: m.id, condition_id: m.condition_id, question: m.question,
      group_item_title: m.group_item_title, slug: m.slug,
      description: null, category: m.category, tags: [],
      image_url: null, resolution_source: null,
      tokens: (m.tokens || []).map(t => ({
        id: t.id, token_id: t.token_id, outcome: t.outcome, price: t.price,
      })),
      minimum_tick_size: m.minimum_tick_size, minimum_order_size: m.minimum_order_size,
      active: m.active, closed: m.closed, resolved: m.resolved,
      end_date_iso: m.end_date_iso, volume: m.volume,
      liquidity: m.liquidity, neg_risk: m.neg_risk,
    })),
  }));
  const slimData = { events: slimEvents, hasMore, total, ...(taxonomy ? { taxonomy } : {}) };
  await pool.query(
    `INSERT INTO api_cache (key, data, updated_at) VALUES ('sports_processed', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(slimData)]
  );
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

  const tags = (mRow.tags || []).map((t: any) => ({ slug: t.slug, label: t.label }));
  const league = deriveLeague(tags);
  const endDate = new Date(mRow.end_date_iso || '');
  const now = new Date();
  const hPast = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);
  let status: 'upcoming' | 'live' | 'final' = 'upcoming';
  const mVol = parseFloat(mRow.volume) || 0;
  if (mRow.closed || hPast > 3) status = 'final';
  else if (endDate < now && mVol < 500) status = 'final';
  else if (endDate < now) status = 'live';

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

function deriveLeague(tags: { slug: string; label: string }[]): string {
  const GENERIC = new Set(['sports', 'esports', 'games']);
  for (const t of tags) {
    if (GENERIC.has(t.slug)) continue;
    if (t.label) return t.label;
  }
  return 'Sports';
}
