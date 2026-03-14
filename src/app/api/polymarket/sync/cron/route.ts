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

    await pool.query(`CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);

    // ═══ PRIORITY: Sync new events from Polymarket FIRST ═══
    // This must run before cache-building so new live matches appear immediately
    try {
      const newRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'new', maxPages: 5 }),
      }).catch(() => null);
      if (newRes?.ok) gapfillStats.new = await newRes.json();
    } catch { /* continue even if this fails */ }

    // ═══ FAST DB OPERATIONS (taxonomy + cache, now includes freshly synced events) ═══

    // 1. Auto-detect sport taxonomy from co-occurrence
    // Parent sports are identified by universal sport names + diversity fallback.
    // Leagues are auto-detected via co-occurrence with parent sports.
    // Sort order is fully automatic (by volume).
    try {
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

      // Non-sport tags to ignore in taxonomy
      const META = new Set(['all','featured','hide-from-new','speculation','pop-culture','celebrities','politics','trump','geopolitics','business','economy','parlays','music','streaming','games','internet-culture','crypto','cryptocurrency','fight','boxingmma','combats','netflix','twitter','x','solana','sol','memecoins','ukraine','russia','peace','putin','zelenskyy','ukraine-peace-deal','china','olympics','skiing','todays-sports','streamer','bush','mss']);

      // Universal sport names — stable constants, not Polymarket-specific.
      // Leagues (nba, nfl, epl, etc.) are auto-detected via co-occurrence.
      const SPORT_NAMES = new Set([
        'basketball', 'soccer', 'football', 'baseball', 'hockey', 'tennis',
        'cricket', 'golf', 'rugby', 'boxing', 'chess', 'lacrosse', 'pickleball',
        'table-tennis', 'ping-pong', 'wrestling', 'swimming', 'volleyball',
        'badminton', 'cycling', 'motorsport', 'esports',
      ]);

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

      // Identify sport-related tags (co-occur with 'sports' or 'esports' on ≥10%)
      const sportRelated = new Set<string>();
      for (const slug of Object.keys(tagCount)) {
        if (slug === 'sports' || META.has(slug)) continue;
        if (tagCount[slug] < 3) continue;
        const cos = coOcc[slug] || {};
        const count = tagCount[slug];
        for (const root of ['sports', 'esports']) {
          if (slug === root) { sportRelated.add(slug); break; }
          if (cos[root] && cos[root] / count >= 0.1) { sportRelated.add(slug); break; }
        }
      }

      // Step 1: Parent sports = sport-related tags whose slug is a universal sport name
      const parentSports: Record<string, string> = {};
      for (const slug of Array.from(sportRelated)) {
        if (SPORT_NAMES.has(slug) && tagCount[slug] >= 1) {
          parentSports[slug] = tagLabel[slug] || slug;
        }
      }

      // Step 2: Also promote via diversity (catches 'ufc', 'f1' not in SPORT_NAMES)
      // BUT skip tags that already co-occur with an existing SPORT_NAMES parent
      const diversity: Record<string, number> = {};
      for (const slug of Array.from(sportRelated)) {
        const cos = coOcc[slug] || {};
        let div = 0;
        for (const co of Object.keys(cos)) {
          if ((sportRelated.has(co) || co === 'sports') && co !== slug) div++;
        }
        diversity[slug] = div;
      }
      for (const slug of Array.from(sportRelated)) {
        if (parentSports[slug]) continue;
        if ((diversity[slug] || 0) >= 5) {
          const cos = coOcc[slug] || {};
          const count = tagCount[slug];
          // Skip if this tag co-occurs with an existing SPORT_NAMES parent
          // OR if a co-occurring tag's slug contains a SPORT_NAMES parent name
          let hasNamedParent = false;
          for (const [co, coCount] of Object.entries(cos)) {
            if (parentSports[co] && SPORT_NAMES.has(co) && coCount / count >= 0.05) {
              hasNamedParent = true; break;
            }
            // e.g., cfb co-occurs with "college-football" → has football parent
            if (coCount / count >= 0.1) {
              for (const parent of Object.keys(parentSports)) {
                if (SPORT_NAMES.has(parent) && parent.length >= 4 && co.includes(parent)) {
                  hasNamedParent = true; break;
                }
              }
            }
            if (hasNamedParent) break;
          }
          if (hasNamedParent) continue;
          if (cos['sports'] && cos['sports'] / count >= 0.15) {
            parentSports[slug] = tagLabel[slug] || slug;
          }
        }
      }

      // Step 3: Assign leagues to parents via co-occurrence
      const leagueToSport: Record<string, string> = {};
      const assignLeagues = () => {
        for (const slug of Array.from(sportRelated)) {
          if (parentSports[slug] || leagueToSport[slug] || slug === 'sports' || slug === 'esports') continue;
          const cos = coOcc[slug] || {};
          const count = tagCount[slug];
          let bestParent: string | null = null;
          let bestCoOcc = 0;
          for (const [co, coCount] of Object.entries(cos)) {
            if (!parentSports[co]) continue;
            if (coCount < 1) continue; // any co-occurrence counts
            if (coCount > bestCoOcc) { bestParent = co; bestCoOcc = coCount; }
          }
          if (bestParent) leagueToSport[slug] = bestParent;
        }
      };
      assignLeagues();

      // Step 3b: Connect orphans via name matching or indirect co-occurrence
      // Loop until no more assignments (handles chains like cfb → college-football → football)
      let changed = true;
      while (changed) {
        changed = false;
        for (const slug of Array.from(sportRelated)) {
          if (parentSports[slug] || leagueToSport[slug] || slug === 'sports' || slug === 'esports') continue;
          // Direct: slug contains a parent sport name (e.g., "college-football" → football)
          for (const parent of Object.keys(parentSports)) {
            if (parent.length >= 4 && slug.includes(parent)) {
              leagueToSport[slug] = parent;
              changed = true;
              break;
            }
          }
          if (leagueToSport[slug]) continue;
          const cos = coOcc[slug] || {};
          const count = tagCount[slug];
          // Co-occurring tag's slug contains a parent name (e.g., cfb co-occurs with "college-football" → football)
          for (const [co, coCount] of Object.entries(cos)) {
            if (META.has(co) || co === slug || co === 'sports') continue;
            if (coCount / count < 0.1) continue;
            for (const parent of Object.keys(parentSports)) {
              if (parent.length >= 4 && co.includes(parent)) {
                leagueToSport[slug] = parent;
                changed = true;
                break;
              }
            }
            if (leagueToSport[slug]) break;
          }
          if (leagueToSport[slug]) continue;
          // Indirect: co-occurring tag is already a league → assign same parent
          // Require ≥10% co-occurrence to avoid noise
          let bestParent: string | null = null;
          let bestCoOcc = 0;
          for (const [co, coCount] of Object.entries(cos)) {
            if (leagueToSport[co] && coCount / count >= 0.1 && coCount > bestCoOcc) {
              bestParent = leagueToSport[co];
              bestCoOcc = coCount;
            }
          }
          if (bestParent) { leagueToSport[slug] = bestParent; changed = true; }
        }
      }

      // Step 4: Orphan sport-related tags with ≥20 events → promote to parent sport
      // Only if they don't co-occur with ANY existing parent or league
      for (const slug of Array.from(sportRelated)) {
        if (parentSports[slug] || leagueToSport[slug] || slug === 'sports' || slug === 'esports') continue;
        const cos = coOcc[slug] || {};
        const count = tagCount[slug];
        let hasAnyParent = false;
        for (const [co, coCount] of Object.entries(cos)) {
          if ((parentSports[co] || leagueToSport[co]) && coCount / count >= 0.05) {
            hasAnyParent = true; break;
          }
        }
        if (hasAnyParent) continue;
        if (tagCount[slug] >= 20) {
          parentSports[slug] = tagLabel[slug] || slug;
        }
      }

      // Re-run league assignment after orphan promotions
      assignLeagues();

      // Step 5: Merge wrongly-promoted parents into their true parent
      // If a parent sport's leagues contain another SPORT_NAMES parent's name,
      // demote it to a league (e.g., cfb has league "college-football" → football)
      const toMerge: [string, string][] = [];
      for (const slug of Object.keys(parentSports)) {
        if (SPORT_NAMES.has(slug)) continue; // don't demote named sports
        const myLeagues = Object.entries(leagueToSport)
          .filter(([, p]) => p === slug)
          .map(([league]) => league);
        for (const league of myLeagues) {
          for (const otherParent of Object.keys(parentSports)) {
            if (otherParent === slug) continue;
            if (SPORT_NAMES.has(otherParent) && otherParent.length >= 4 && league.includes(otherParent)) {
              toMerge.push([slug, otherParent]);
              break;
            }
          }
          if (toMerge.some(([child]) => child === slug)) break;
        }
      }
      for (const [child, parent] of toMerge) {
        delete parentSports[child];
        leagueToSport[child] = parent;
        for (const [league, p] of Object.entries(leagueToSport)) {
          if (p === child) leagueToSport[league] = parent;
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

    // 2. Scrape Polymarket's sports page to extract sidebar ordering
    try {
      const pmRes = await fetch('https://polymarket.com/sports', {
        cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (pmRes.ok) {
        const html = await pmRes.text();

        // Extract top leagues from sidebar (appear before "All Sports")
        // Pattern: league slugs in href links like /sports/nba/games or sidebar items
        const topLeagueSlugs: string[] = [];
        const topLeagueRe = /href="\/sports\/([a-z0-9-]+)\/games"/g;
        let m;
        const seenTop = new Set<string>();
        // First 4 unique league links before sport categories = top leagues
        while ((m = topLeagueRe.exec(html)) !== null && topLeagueSlugs.length < 10) {
          const slug = m[1];
          if (!seenTop.has(slug)) { seenTop.add(slug); topLeagueSlugs.push(slug); }
        }

        // Extract sport category order from sidebar
        // Pattern: sport names in the sidebar section, or /sports/[sport] links
        const sportCategoryRe = /href="\/sports\/([a-z0-9-]+)(?:\/[a-z0-9-]+)?\/games"/g;
        const allSlugs: string[] = [];
        const seenAll = new Set<string>();
        while ((m = sportCategoryRe.exec(html)) !== null) {
          const slug = m[1];
          if (!seenAll.has(slug)) { seenAll.add(slug); allSlugs.push(slug); }
        }

        // Also extract sport category names from text patterns
        const sportTextRe = />(Basketball|Soccer|Esports|Tennis|Cricket|Hockey|Rugby|Table Tennis|UFC|Football|Golf|Formula 1|Chess|Boxing|Pickleball|Lacrosse|Baseball)<\//gi;
        const sportOrder: string[] = [];
        const seenSports = new Set<string>();
        while ((m = sportTextRe.exec(html)) !== null) {
          const name = m[1];
          if (!seenSports.has(name.toLowerCase())) {
            seenSports.add(name.toLowerCase());
            sportOrder.push(name);
          }
        }

        // Polymarket slug → our slug mapping
        const PM_TO_OUR: Record<string, string> = {
          cbb: 'ncaa-basketball', f1: 'formula1',
        };

        if (topLeagueSlugs.length >= 2 || sportOrder.length >= 3) {
          await pool.query(
            `INSERT INTO api_cache (key, data, updated_at) VALUES ('polymarket_sport_order', $1::jsonb, NOW())
             ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
            [JSON.stringify({
              topLeagues: topLeagueSlugs.map(s => PM_TO_OUR[s] || s),
              sportOrder: sportOrder,
              allSlugs: allSlugs.map(s => PM_TO_OUR[s] || s),
              scrapedAt: new Date().toISOString(),
            })]
          );
        }
      }
    } catch { /* skip — fallback to hardcoded order */ }

    // 3. Fix stale categories
    try {
      await pool.query(`UPDATE event_groups SET category = 'Sports' WHERE category != 'Sports' AND (tags @> '[{"slug":"sports"}]'::jsonb OR tags @> '[{"slug":"esports"}]'::jsonb)`);
      await pool.query(`UPDATE markets SET category = 'Sports' WHERE category != 'Sports' AND (tags @> '[{"slug":"sports"}]'::jsonb OR tags @> '[{"slug":"esports"}]'::jsonb)`);
    } catch { /* skip */ }

    // 3. Precompute sports cache
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
            AND (eg.end_date_iso IS NULL OR eg.end_date_iso::timestamptz > NOW() - INTERVAL '3 hours')
          ORDER BY eg.end_date_iso ASC NULLS LAST LIMIT 500
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
            AND (m.end_date_iso IS NULL OR m.end_date_iso::timestamptz > NOW() - INTERVAL '3 hours')
          ORDER BY m.end_date_iso ASC NULLS LAST LIMIT 200
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

      await pool.query(
        `INSERT INTO api_cache (key, data, updated_at) VALUES ('sports_live', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify({
          eventGroups: egResult.rows,
          standaloneMarkets: standaloneResult.rows,
          subMarkets: subMarketRows,
          tokens: tokenRows,
          cachedAt: new Date().toISOString(),
        })]
      );
    } catch (cacheErr) {
      console.error('Sports cache precompute error:', cacheErr);
    }

    // ═══ SLOW HTTP OPERATIONS (gapfill + resolution) ═══

    // 4. Refresh top 300 events by volume (updates prices)
    const refreshRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'refresh', limit: 300 }),
    }).catch(() => null);
    if (refreshRes?.ok) gapfillStats.refresh = await refreshRes.json();

    // 6. Full incremental sweep — 20 pages = 2,000 events per cron run
    const discoverRes = await fetch(`${baseUrl}/api/polymarket/sync/gapfill${secretParam}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'discover', maxPages: 20 }),
    }).catch(() => null);
    if (discoverRes?.ok) gapfillStats.discover = await discoverRes.json();

    // 7. Resolution sync
    try {
      const { rows: activeMarkets } = await pool.query(
        `SELECT id, polymarket_id FROM markets
         WHERE polymarket_id IS NOT NULL AND closed = false AND active = true
         ORDER BY volume DESC LIMIT 100`
      );
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
                [pm.closed || false, !!pm.closedTime, pm.active !== false,
                 pm.winningOutcome || null, pm.closedTime || null, market.id]
              );
              totalResolved++;
            }
          } catch { /* skip */ }
        }));
      }
    } catch { /* skip */ }

    // 8. Warm caches
    if (baseUrl) {
      const warmUrls = [
        `${baseUrl}/api/polymarket/sports?tab=live&offset=0&limit=30`,
        `${baseUrl}/api/polymarket/events?limit=50&order=volume24hr`,
        `${baseUrl}/api/polymarket/events?limit=100&order=newest`,
        `${baseUrl}/api/polymarket/breaking`,
        `${baseUrl}/api/polymarket/taxonomy`,
      ];
      await Promise.allSettled(warmUrls.map(url => fetch(url, { cache: 'no-store' }).catch(() => {})));
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
