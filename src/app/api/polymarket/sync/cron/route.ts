import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const preferredRegion = 'sin1';

const GAMMA_API = 'https://gamma-api.polymarket.com';

const SPORT_TAGS: { tag: string; quickPages: number }[] = [
  { tag: 'sports', quickPages: 3 },
  { tag: 'esports', quickPages: 3 },
];

const MAX_MARKETS_PER_EVENT = 30;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  let totalSynced = 0;
  let totalSkipped = 0;
  let totalPages = 0;
  let totalResolved = 0;
  let firstError: string | undefined;

  try {
    for (const { tag, quickPages } of SPORT_TAGS) {
      const pageSize = 50;
      for (let page = 0; page < quickPages; page++) {
        try {
          const sp = new URLSearchParams({
            tag_slug: tag,
            limit: String(pageSize),
            offset: String(page * pageSize),
            order: 'volume24hr',
            ascending: 'false',
            active: 'true',
          });
          const res = await fetch(`${GAMMA_API}/events?${sp}`, {
            cache: 'no-store',
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (!res.ok) break;
          const events: any[] = await res.json();
          if (events.length === 0) break;

          for (const e of events) {
            try {
              await upsertEvent(e);
              totalSynced++;
            } catch (err) {
              totalSkipped++;
              if (!firstError) firstError = `${e.slug}: ${(err as Error).message}`;
            }
          }

          totalPages++;
          if (events.length < pageSize) break;
        } catch {
          break;
        }
      }
    }

    // Resolution sync
    try {
      const { rows: activeMarkets } = await pool.query(
        `SELECT id, polymarket_id FROM markets
         WHERE polymarket_id IS NOT NULL AND closed = false
         ORDER BY created_at DESC LIMIT 20`
      );
      for (const market of activeMarkets) {
        try {
          const res = await fetch(
            `${GAMMA_API}/markets/${market.polymarket_id}`,
            { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          if (!res.ok) continue;
          const pm = await res.json();
          if (pm.closed || !pm.active) {
            await pool.query(
              `UPDATE markets SET closed = true, resolved = true, active = false, accepting_orders = false
               WHERE id = $1`,
              [market.id]
            );
            totalResolved++;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

    // Precompute sports cache
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);

      const SPORT_TAGS_LIST = ['sports', 'esports', 'basketball', 'soccer', 'tennis', 'hockey', 'cricket', 'baseball', 'football', 'rugby', 'ufc', 'boxing', 'golf', 'f1', 'chess', 'table-tennis', 'pickleball', 'lacrosse'];
      const rootCond = SPORT_TAGS_LIST.map(s => `eg.tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ');
      const rootCondM = SPORT_TAGS_LIST.map(s => `m.tags @> '[{"slug":"${s}"}]'::jsonb`).join(' OR ');

      // Get event groups and standalone markets in parallel
      const [egResult, standaloneResult] = await Promise.all([
        pool.query(`
          SELECT eg.id, eg.title, eg.slug, eg.description, eg.category, eg.tags,
            eg.image_url, eg.end_date_iso, eg.volume, eg.volume_24hr, eg.liquidity,
            eg.neg_risk, eg.created_at, eg.polymarket_id
          FROM event_groups eg
          WHERE eg.polymarket_id IS NOT NULL AND (${rootCond})
            AND eg.title ~* 'vs\\.?'
            AND EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)
          ORDER BY eg.volume DESC LIMIT 300
        `),
        pool.query(`
          SELECT m.id, m.question, m.slug, m.category, m.tags,
            m.image_url, m.end_date_iso, m.volume, m.volume_24hr, m.liquidity,
            m.neg_risk, m.created_at, m.active, m.closed, m.polymarket_id,
            m.condition_id, m.minimum_tick_size, m.minimum_order_size
          FROM markets m
          WHERE m.polymarket_id IS NOT NULL AND m.event_group_id IS NULL
            AND (${rootCondM}) AND m.question ~* 'vs\\.?' AND m.closed = false
          ORDER BY m.volume DESC LIMIT 100
        `),
      ]);

      // Load sub-markets for event groups
      const groupIds = egResult.rows.map((r: any) => r.id);
      let subMarketRows: any[] = [];
      if (groupIds.length > 0) {
        const { rows } = await pool.query(
          `SELECT m.id, m.event_group_id, m.question, m.group_item_title, m.slug,
            m.image_url, m.end_date_iso, m.volume, m.liquidity,
            m.active, m.closed, m.condition_id, m.minimum_tick_size, m.minimum_order_size,
            m.polymarket_id, m.created_at, m.description
          FROM markets m WHERE m.event_group_id = ANY($1) AND m.closed = false
          ORDER BY m.created_at`,
          [groupIds]
        );
        subMarketRows = rows;
      }

      // Load tokens for all markets
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

    // Warm all API caches (Cloudflare + Vercel edge)
    const baseUrl = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (baseUrl) {
      const warmUrls = [
        `${baseUrl}/api/polymarket/sports?tab=live&offset=0&limit=30`,
        `${baseUrl}/api/polymarket/events?limit=50&order=volume24hr`,
        `${baseUrl}/api/polymarket/events?limit=100&order=newest`,
        `${baseUrl}/api/polymarket/breaking`,
        `${baseUrl}/api/polymarket/taxonomy`,
        `${baseUrl}/api/polymarket/events/live?tag=politics&limit=100`,
        `${baseUrl}/api/polymarket/events/live?tag=crypto&limit=100`,
        `${baseUrl}/api/polymarket/events/live?tag=sports&limit=100`,
      ];
      await Promise.allSettled(warmUrls.map(url => fetch(url, { cache: 'no-store' }).catch(() => {})));

      // Warm ISR page caches (triggers revalidation so HTML contains real data)
      const pageUrls = [
        `${baseUrl}/`,
        `${baseUrl}/sports`,
        `${baseUrl}/breaking`,
        `${baseUrl}/new`,
      ];
      await Promise.allSettled(pageUrls.map(url => fetch(url, { cache: 'no-store' }).catch(() => {})));
    }
  } catch (err) {
    return NextResponse.json({
      error: (err as Error).message,
      totalSynced, totalSkipped, totalPages,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    }, { status: 500 });
  }

  return NextResponse.json({
    totalSynced, totalSkipped, totalResolved, totalPages,
    firstError: firstError || null,
    duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
  });
}

// ── Upsert logic: 3 queries per event (event_group + batch markets + batch tokens) ──

async function upsertEvent(e: any) {
  const allMarkets = e.markets || [];
  if (allMarkets.length === 0) return;

  const markets = allMarkets.slice(0, MAX_MARKETS_PER_EVENT);
  const isMulti = allMarkets.length > 1 || e.negRisk;
  const tags = JSON.stringify((e.tags || []).map((t: any) => ({ slug: t.slug, label: t.label })));

  let eventGroupId: string | null = null;

  if (isMulti) {
    const { rows } = await pool.query(`
      INSERT INTO event_groups (polymarket_id, title, slug, description, category, tags, image_url, end_date_iso, volume, volume_24hr, liquidity, neg_risk)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
        title = EXCLUDED.title, slug = EXCLUDED.slug, description = EXCLUDED.description,
        tags = EXCLUDED.tags, image_url = EXCLUDED.image_url,
        volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
        liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso
      RETURNING id
    `, [
      e.id, e.title, e.slug,
      e.description || null, e.category || 'General', tags,
      e.image || null, e.endDate || null,
      e.volume || 0, e.volume24hr || 0, e.liquidity || 0,
      e.negRisk || false,
    ]);
    eventGroupId = rows[0].id;
  }

  // Batch upsert all markets in one query using unnest
  const mktValues: any[] = [];
  const mktPlaceholders: string[] = [];
  const cols = 22;
  let pi = 1;

  for (const m of markets) {
    const baseSlug = m.slug || e.slug;
    const ph = [];
    for (let c = 0; c < cols; c++) ph.push(`$${pi++}`);
    mktPlaceholders.push(`(${ph.join(',')})`);
    mktValues.push(
      m.id, m.conditionId || '', m.question,
      m.groupItemTitle || null, m.description || null,
      m.category || e.category || 'General', tags,
      baseSlug, m.image || e.image || null,
      m.resolutionSource || null,
      m.orderPriceMinTickSize || 0.01, m.orderMinSize || 5,
      m.active !== false, m.closed || false,
      !!m.closedTime, m.active !== false && !m.closed,
      m.endDate || e.endDate || null,
      parseFloat(m.volume) || 0, m.volume24hr || 0,
      parseFloat(m.liquidity) || 0, e.negRisk || false,
      eventGroupId,
    );
  }

  let marketRows: any[];
  try {
    ({ rows: marketRows } = await pool.query(`
      INSERT INTO markets (
        polymarket_id, condition_id, question, group_item_title, description,
        category, tags, slug, image_url, resolution_source,
        minimum_tick_size, minimum_order_size,
        active, closed, resolved, accepting_orders,
        end_date_iso, volume, volume_24hr, liquidity, neg_risk, event_group_id
      ) VALUES ${mktPlaceholders.join(',')}
      ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
        question = EXCLUDED.question, group_item_title = EXCLUDED.group_item_title,
        active = EXCLUDED.active, closed = EXCLUDED.closed,
        resolved = EXCLUDED.resolved, accepting_orders = EXCLUDED.accepting_orders,
        volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
        liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
        tags = EXCLUDED.tags, event_group_id = EXCLUDED.event_group_id
      RETURNING id, polymarket_id
    `, mktValues));
  } catch (err: any) {
    // Slug conflict — fall back to individual inserts
    if (err.code === '23505' && err.constraint?.includes('slug')) {
      marketRows = [];
      for (const m of markets) {
        try {
          const baseSlug = m.slug || e.slug;
          const { rows } = await pool.query(`
            INSERT INTO markets (
              polymarket_id, condition_id, question, group_item_title, description,
              category, tags, slug, image_url, resolution_source,
              minimum_tick_size, minimum_order_size,
              active, closed, resolved, accepting_orders,
              end_date_iso, volume, volume_24hr, liquidity, neg_risk, event_group_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
              question = EXCLUDED.question, group_item_title = EXCLUDED.group_item_title,
              active = EXCLUDED.active, closed = EXCLUDED.closed,
              resolved = EXCLUDED.resolved, accepting_orders = EXCLUDED.accepting_orders,
              volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
              liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
              tags = EXCLUDED.tags, event_group_id = EXCLUDED.event_group_id
            RETURNING id, polymarket_id
          `, [
            m.id, m.conditionId || '', m.question,
            m.groupItemTitle || null, m.description || null,
            m.category || e.category || 'General', tags,
            `${baseSlug}-${m.id.slice(0, 8)}`, m.image || e.image || null,
            m.resolutionSource || null,
            m.orderPriceMinTickSize || 0.01, m.orderMinSize || 5,
            m.active !== false, m.closed || false,
            !!m.closedTime, m.active !== false && !m.closed,
            m.endDate || e.endDate || null,
            parseFloat(m.volume) || 0, m.volume24hr || 0,
            parseFloat(m.liquidity) || 0, e.negRisk || false,
            eventGroupId,
          ]);
          marketRows.push(rows[0]);
        } catch { /* skip individual market */ }
      }
    } else {
      throw err;
    }
  }

  // Build polymarket_id → db_id map
  const idMap = new Map<string, string>();
  for (const row of marketRows) {
    idMap.set(row.polymarket_id, row.id);
  }

  // Batch upsert all tokens
  const tokenValues: any[] = [];
  const tokenPlaceholders: string[] = [];
  let tidx = 1;

  for (const m of markets) {
    const dbId = idMap.get(m.id);
    if (!dbId) continue;

    const outcomes = parseField(m.outcomes, ['Yes', 'No']);
    const prices = parseField(m.outcomePrices, []).map(Number);
    const tokenIds = parseField(m.clobTokenIds, []);

    for (let i = 0; i < outcomes.length; i++) {
      const tokenId = tokenIds[i] || `${m.id}-${i}`;
      tokenPlaceholders.push(`($${tidx},$${tidx + 1},$${tidx + 2},$${tidx + 3},$${tidx + 4})`);
      tokenValues.push(dbId, tokenId, outcomes[i], prices[i] || 0.5, m.groupItemTitle || null);
      tidx += 5;
    }
  }

  if (tokenPlaceholders.length > 0) {
    try {
      await pool.query(`
        INSERT INTO tokens (market_id, token_id, outcome, price, label)
        VALUES ${tokenPlaceholders.join(',')}
        ON CONFLICT (market_id, outcome) DO UPDATE SET
          token_id = EXCLUDED.token_id, price = EXCLUDED.price, label = EXCLUDED.label
      `, tokenValues);
    } catch (tokenErr: any) {
      if (tokenErr.code === '23505') {
        // Fall back to individual updates
        for (const m of markets) {
          const dbId = idMap.get(m.id);
          if (!dbId) continue;
          const outcomes = parseField(m.outcomes, ['Yes', 'No']);
          const prices = parseField(m.outcomePrices, []).map(Number);
          for (let i = 0; i < outcomes.length; i++) {
            try {
              await pool.query(
                `UPDATE tokens SET price = $1, label = $2 WHERE market_id = $3 AND outcome = $4`,
                [prices[i] || 0.5, m.groupItemTitle || null, dbId, outcomes[i]]
              );
            } catch { /* skip */ }
          }
        }
      }
    }
  }
}

function parseField(val: unknown, fallback: any[]): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}
