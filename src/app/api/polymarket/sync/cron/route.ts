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
      body: JSON.stringify({ mode: 'new', maxPages: 5 }),
    }).catch(() => null);
    if (newRes?.ok) gapfillStats.new = await newRes.json();

    // 2. Refresh top 300 events by volume (updates prices, resolution, closed status)
    const refreshRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'refresh', limit: 300 }),
    }).catch(() => null);
    if (refreshRes?.ok) gapfillStats.refresh = await refreshRes.json();

    // 3. Full incremental sweep — 20 pages = 2,000 events per cron run
    //    Covers ALL Polymarket events regardless of tags, updates existing ones too
    //    At ~9,000 total events and 10-min cron interval, full sweep every ~50 minutes
    const discoverRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'discover', maxPages: 20 }),
    }).catch(() => null);
    if (discoverRes?.ok) gapfillStats.discover = await discoverRes.json();

    // 4. Resolution sync — check recently active markets for closed/resolved status
    try {
      const { rows: activeMarkets } = await pool.query(
        `SELECT id, polymarket_id FROM markets
         WHERE polymarket_id IS NOT NULL AND closed = false AND active = true
         ORDER BY volume DESC LIMIT 100`
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

    // 5. Auto-detect sport taxonomy from tag co-occurrence
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);

      const { rows: sportEvents } = await pool.query(`
        SELECT tags FROM event_groups
        WHERE polymarket_id IS NOT NULL
          AND (category = 'Sports' OR tags @> '[{"slug":"sports"}]'::jsonb OR tags @> '[{"slug":"esports"}]'::jsonb)
          AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = event_groups.id AND m.closed = false)
        UNION ALL
        SELECT tags FROM markets
        WHERE polymarket_id IS NOT NULL AND event_group_id IS NULL
          AND (category = 'Sports' OR tags @> '[{"slug":"sports"}]'::jsonb OR tags @> '[{"slug":"esports"}]'::jsonb)
          AND closed = false
      `);

      const META = new Set(['all','featured','hide-from-new','speculation','pop-culture','celebrities','politics','trump','geopolitics','business','economy','parlays','music','streaming','games','internet-culture','crypto','cryptocurrency','fight','boxingmma','combats','netflix','twitter','x','solana','sol','memecoins','ukraine','russia','peace','putin','zelenskyy','ukraine-peace-deal','china','olympics','skiing','todays-sports']);
      const ROOT = new Set(['sports', 'esports']);

      const tagCount: Record<string, number> = {};
      const tagLabel: Record<string, string> = {};
      const coOcc: Record<string, Record<string, number>> = {};

      for (const { tags } of sportEvents) {
        if (!Array.isArray(tags)) continue;
        const slugs: string[] = [];
        for (const t of tags as any[]) {
          const s = (t.slug || '').toLowerCase();
          if (!s) continue;
          slugs.push(s);
          tagCount[s] = (tagCount[s] || 0) + 1;
          if (!tagLabel[s]) tagLabel[s] = t.label || s;
        }
        for (const a of slugs) {
          for (const b of slugs) {
            if (a === b) continue;
            if (!coOcc[a]) coOcc[a] = {};
            coOcc[a][b] = (coOcc[a][b] || 0) + 1;
          }
        }
      }

      // Find most specific parent for each tag (co-occurs on ≥20% of events, has more total events)
      const parentOf: Record<string, string> = {};
      for (const slug of Object.keys(tagCount)) {
        if (ROOT.has(slug) || META.has(slug)) continue;
        const count = tagCount[slug];
        const cos = coOcc[slug] || {};
        let best: string | null = null;
        let bestN = Infinity;
        for (const [co, coCount] of Object.entries(cos)) {
          if (META.has(co) || co === slug) continue;
          const coN = tagCount[co] || 0;
          if (coN <= count) continue;
          if (coCount / count < 0.2) continue;
          if (coN < bestN) { best = co; bestN = coN; }
        }
        if (best) parentOf[slug] = best;
      }

      // Level 1: parent sports = direct children of root tags
      const parentSports: Record<string, string> = {};
      for (const [slug, par] of Object.entries(parentOf)) {
        if (ROOT.has(par)) parentSports[slug] = tagLabel[slug] || slug;
      }

      // Level 2: leagues = children/grandchildren of parent sports
      const leagueToSport: Record<string, string> = {};
      for (const [slug, par] of Object.entries(parentOf)) {
        if (parentSports[slug] || ROOT.has(slug)) continue;
        if (parentSports[par]) {
          leagueToSport[slug] = par;
        } else {
          const gp = parentOf[par];
          if (gp && parentSports[gp]) leagueToSport[slug] = gp;
          else if (gp) {
            const ggp = parentOf[gp];
            if (ggp && parentSports[ggp]) leagueToSport[slug] = ggp;
          }
        }
      }

      await pool.query(
        `INSERT INTO api_cache (key, data, updated_at) VALUES ('sport_taxonomy_auto', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify({
          parentSports, leagueToSport,
          allSportSlugs: Array.from(new Set(['sports', 'esports', ...Object.keys(parentSports), ...Object.keys(leagueToSport)])),
          computedAt: new Date().toISOString(),
        })]
      );
    } catch (taxErr) {
      console.error('Auto taxonomy error:', taxErr);
    }

    // 5.5. Fix stale categories — ensure all sports-tagged events have category = 'Sports'
    try {
      await pool.query(`UPDATE event_groups SET category = 'Sports' WHERE category != 'Sports' AND (tags @> '[{"slug":"sports"}]'::jsonb OR tags @> '[{"slug":"esports"}]'::jsonb)`);
      await pool.query(`UPDATE markets SET category = 'Sports' WHERE category != 'Sports' AND (tags @> '[{"slug":"sports"}]'::jsonb OR tags @> '[{"slug":"esports"}]'::jsonb)`);
    } catch { /* skip */ }

    // 6. Precompute sports cache
    try {
      const [egResult, standaloneResult] = await Promise.all([
        pool.query(`
          SELECT eg.id, eg.title, eg.slug, eg.description, eg.category, eg.tags,
            eg.image_url, eg.end_date_iso, eg.volume, eg.volume_24hr, eg.liquidity,
            eg.neg_risk, eg.created_at, eg.polymarket_id,
            eg.comment_count, eg.competitive, eg.volume_1wk, eg.volume_1mo,
            eg.featured, eg.open_interest, eg.start_date
          FROM event_groups eg
          WHERE eg.polymarket_id IS NOT NULL
            AND (eg.category = 'Sports' OR eg.tags @> '[{"slug":"sports"}]'::jsonb OR eg.tags @> '[{"slug":"esports"}]'::jsonb)
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
            AND (m.category = 'Sports' OR m.tags @> '[{"slug":"sports"}]'::jsonb OR m.tags @> '[{"slug":"esports"}]'::jsonb)
            AND m.question ~* 'vs\\.?' AND m.closed = false
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
