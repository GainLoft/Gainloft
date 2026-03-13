import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const preferredRegion = 'sin1';

const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  let totalResolved = 0;
  let firstError: string | undefined;
  const gapfillStats: any = {};

  try {
    const baseUrl = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!baseUrl) throw new Error('No SITE_URL or VERCEL_URL configured');
    const secretParam = cronSecret ? `?secret=${cronSecret}` : '';

    // 1. Discover brand new events (newest IDs first, no active filter)
    const newRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'new', maxPages: 10 }),
    }).catch(() => null);
    if (newRes?.ok) gapfillStats.new = await newRes.json();

    // 2. Refresh top 500 events by volume (updates prices, resolution, closed status)
    const refreshRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'refresh', limit: 500 }),
    }).catch(() => null);
    if (refreshRes?.ok) gapfillStats.refresh = await refreshRes.json();

    // 3. Full incremental sweep — 50 pages = 5,000 events per cron run
    //    Covers ALL Polymarket events regardless of tags, updates existing ones too
    const discoverRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'discover', maxPages: 50 }),
    }).catch(() => null);
    if (discoverRes?.ok) gapfillStats.discover = await discoverRes.json();

    // 4. Resolution sync — check recently active markets for closed/resolved status
    try {
      const { rows: activeMarkets } = await pool.query(
        `SELECT id, polymarket_id FROM markets
         WHERE polymarket_id IS NOT NULL AND closed = false AND active = true
         ORDER BY volume DESC LIMIT 200`
      );

      // Batch check resolution via events API (more efficient than per-market)
      const batchSize = 20;
      for (let i = 0; i < activeMarkets.length; i += batchSize) {
        const batch = activeMarkets.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(async (market: any) => {
          try {
            const res = await fetch(
              `${GAMMA_API}/markets/${market.polymarket_id}`,
              { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            if (!res.ok) return;
            const pm = await res.json();
            if (pm.closed || !pm.active) {
              await pool.query(
                `UPDATE markets SET closed = $1, resolved = $2, active = $3, accepting_orders = false,
                 winning_outcome = $4, resolved_at = $5
                 WHERE id = $6`,
                [
                  pm.closed || false,
                  !!pm.closedTime,
                  pm.active !== false,
                  pm.winningOutcome || null,
                  pm.closedTime || null,
                  market.id,
                ]
              );
              totalResolved++;
            }
          } catch { /* skip */ }
        }));
      }
    } catch { /* skip */ }

    // 5. Precompute sports cache
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);

      // Use ALL known sport/league tags dynamically from LEAGUE_TO_SPORT + PARENT_SPORTS
      const allSportSlugs = [
        'sports', 'esports',
        'basketball', 'soccer', 'tennis', 'hockey', 'cricket', 'baseball', 'football', 'rugby',
        'ufc', 'boxing', 'golf', 'f1', 'chess', 'table-tennis', 'pickleball', 'lacrosse',
        'nba', 'ncaab', 'wnba', 'nhl', 'nfl', 'mlb', 'mls', 'epl', 'ucl', 'la-liga',
        'serie-a', 'bundesliga', 'ligue-1', 'premier-league', 'champions-league', 'europa-league',
        'liga-mx', 'copa-america', 'euros', 'world-cup', 'saudi-pro-league', 'concacaf',
        'counter-strike-2', 'dota-2', 'league-of-legends', 'valorant', 'honor-of-kings',
        'call-of-duty', 'overwatch', 'rocket-league', 'rainbow-six',
        'atp', 'wta', 'us-open', 'wimbledon', 'french-open', 'australian-open',
        'ipl', 't20-world-cup', 'pga', 'masters', 'six-nations', 'super-bowl',
        'nfl-playoffs', 'nba-playoffs', 'nba-finals', 'nhl-playoffs', 'march-madness',
        'ncaaf', 'cfb', 'college-football', 'ncaa', 'college-basketball',
        'khl', 'npb', 'xfl', 'formula-1',
      ];
      const rootCond = allSportSlugs.map(s => `eg.tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ');
      const rootCondM = allSportSlugs.map(s => `m.tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ');

      const [egResult, standaloneResult] = await Promise.all([
        pool.query(`
          SELECT eg.id, eg.title, eg.slug, eg.description, eg.category, eg.tags,
            eg.image_url, eg.end_date_iso, eg.volume, eg.volume_24hr, eg.liquidity,
            eg.neg_risk, eg.created_at, eg.polymarket_id,
            eg.comment_count, eg.competitive, eg.volume_1wk, eg.volume_1mo,
            eg.featured, eg.open_interest, eg.start_date
          FROM event_groups eg
          WHERE eg.polymarket_id IS NOT NULL AND (${rootCond})
            AND eg.title ~* 'vs\\.?'
            AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
          ORDER BY eg.volume DESC LIMIT 500
        `),
        pool.query(`
          SELECT m.id, m.question, m.slug, m.category, m.tags,
            m.image_url, m.end_date_iso, m.volume, m.volume_24hr, m.liquidity,
            m.neg_risk, m.created_at, m.active, m.closed, m.polymarket_id,
            m.condition_id, m.minimum_tick_size, m.minimum_order_size,
            m.best_bid, m.best_ask, m.spread, m.last_trade_price,
            m.price_change_1h, m.price_change_24h, m.price_change_1w, m.price_change_1m,
            m.competitive, m.volume_1wk, m.volume_1mo, m.submitted_by
          FROM markets m
          WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
            AND (${rootCondM}) AND m.question ~* 'vs\\.?' AND m.closed = false
          ORDER BY m.volume DESC LIMIT 200
        `),
      ]);

      const groupIds = egResult.rows.map((r: any) => r.id);
      let subMarketRows: any[] = [];
      if (groupIds.length > 0) {
        const { rows } = await pool.query(
          `SELECT m.id, m.event_group_id, m.question, m.group_item_title, m.slug,
            m.image_url, m.end_date_iso, m.volume, m.volume_24hr, m.liquidity,
            m.active, m.closed, m.condition_id, m.minimum_tick_size, m.minimum_order_size,
            m.polymarket_id, m.created_at, m.description,
            m.best_bid, m.best_ask, m.spread, m.last_trade_price,
            m.price_change_1h, m.price_change_24h, m.price_change_1w, m.price_change_1m,
            m.competitive, m.volume_1wk, m.volume_1mo, m.submitted_by
          FROM markets m WHERE m.event_group_id = ANY($1) AND m.closed = false
          ORDER BY m.created_at`,
          [groupIds]
        );
        subMarketRows = rows;
      }

      const allMarketIds = [
        ...subMarketRows.map((m: any) => m.id),
        ...standaloneResult.rows.map((r: any) => r.id),
      ];
      let tokenRows: any[] = [];
      if (allMarketIds.length > 0) {
        const { rows } = await pool.query(
          `SELECT market_id, token_id, outcome, price, label FROM tokens WHERE market_id = ANY($1)`,
          [allMarketIds]
        );
        tokenRows = rows;
      }

      const cacheData = {
        eventGroups: egResult.rows,
        standaloneMarkets: standaloneResult.rows,
        subMarkets: subMarketRows,
        tokens: tokenRows,
        cachedAt: new Date().toISOString(),
      };

      await pool.query(
        `INSERT INTO api_cache (key, data, updated_at) VALUES ('sports_live', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(cacheData)]
      );
    } catch (cacheErr) {
      console.error('Sports cache precompute error:', cacheErr);
    }

    // 6. Warm caches
    if (baseUrl) {
      const warmUrls = [
        `${baseUrl}/api/polymarket/sports?tab=live&offset=0&limit=30`,
        `${baseUrl}/api/polymarket/events?limit=50&order=volume24hr`,
        `${baseUrl}/api/polymarket/events?limit=100&order=newest`,
        `${baseUrl}/api/polymarket/breaking`,
        `${baseUrl}/api/polymarket/taxonomy`,
      ];
      await Promise.allSettled(warmUrls.map(url => fetch(url, { cache: 'no-store' }).catch(() => {})));
      const pageUrls = [`${baseUrl}/`, `${baseUrl}/sports`, `${baseUrl}/breaking`, `${baseUrl}/new`];
      await Promise.allSettled(pageUrls.map(url => fetch(url, { cache: 'no-store' }).catch(() => {})));
    }
  } catch (err) {
    return NextResponse.json({
      error: (err as Error).message,
      totalResolved, gapfill: gapfillStats,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    }, { status: 500 });
  }

  return NextResponse.json({
    totalResolved,
    gapfill: gapfillStats,
    firstError: firstError || null,
    duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  });
}
