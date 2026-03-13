import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const maxDuration = 300;
export const preferredRegion = 'sin1';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const MAX_MARKETS_PER_EVENT = 100;

// Skip auto-generated crypto time-series events
const CRYPTO_SERIES_RE = /^(btc|eth|sol|xrp|doge|bnb|ada|dot|avax|matic|link|bitcoin|ethereum|solana|dogecoin|cardano|ripple)-(updown|up-or-down|up-down|multistrike)/i;

const TAG_TO_CATEGORY: Record<string, string> = {
  crypto: 'Crypto', 'crypto-prices': 'Crypto', bitcoin: 'Crypto', ethereum: 'Crypto',
  solana: 'Crypto', defi: 'Crypto', nft: 'Crypto', airdrops: 'Crypto',
  politics: 'Politics', elections: 'Politics', congress: 'Politics',
  sports: 'Sports', nba: 'Sports', nfl: 'Sports', mlb: 'Sports', soccer: 'Sports',
  esports: 'Sports', hockey: 'Sports', tennis: 'Sports', cricket: 'Sports',
  basketball: 'Sports', baseball: 'Sports', golf: 'Sports', ufc: 'Sports',
  boxing: 'Sports', rugby: 'Sports', f1: 'Sports', ncaab: 'Sports', ncaaf: 'Sports',
  finance: 'Finance', economy: 'Finance', 'fed-funds': 'Finance',
  tech: 'Tech', ai: 'Tech', science: 'Science',
  culture: 'Culture', music: 'Culture', entertainment: 'Culture',
  geopolitics: 'Geopolitics', climate: 'Climate',
  games: 'Games',
};

function deriveCategoryFromTags(tagList: { slug: string; label: string }[]): string | null {
  for (const tag of tagList) {
    const mapped = TAG_TO_CATEGORY[tag.slug];
    if (mapped) return mapped;
  }
  return null;
}

/**
 * GET /api/polymarket/sync/gapfill
 * Returns current gap-fill progress and stats.
 */
export async function GET() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);

    const [cursorResult, statsResult] = await Promise.all([
      pool.query(`SELECT data FROM api_cache WHERE key = 'gapfill_cursor'`),
      pool.query(`
        SELECT
          COUNT(DISTINCT polymarket_id) FILTER (WHERE polymarket_id IS NOT NULL) as total_events,
          MAX(CAST(polymarket_id AS INTEGER)) FILTER (WHERE polymarket_id IS NOT NULL AND polymarket_id ~ '^[0-9]+$') as max_id,
          MIN(CAST(polymarket_id AS INTEGER)) FILTER (WHERE polymarket_id IS NOT NULL AND polymarket_id ~ '^[0-9]+$') as min_id
        FROM event_groups
      `),
    ]);

    const cursor = cursorResult.rows[0]?.data || { offset: 0, completedAt: null, totalSynced: 0, totalChecked: 0 };
    const stats = statsResult.rows[0];

    return NextResponse.json({
      cursor,
      dbStats: {
        totalEvents: parseInt(stats.total_events) || 0,
        maxId: parseInt(stats.max_id) || 0,
        minId: parseInt(stats.min_id) || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/polymarket/sync/gapfill
 *
 * Three modes:
 *
 * 1. "discover" — Sequential ID-ordered scan of ALL Polymarket events.
 *    Always upserts (updates existing events with latest data).
 *    Body: { mode?: "discover", maxPages?: number, pageSize?: number, resetCursor?: boolean }
 *
 * 2. "new" — Fetch events newer than our max DB ID (no active filter).
 *    Body: { mode: "new", maxPages?: number }
 *
 * 3. "refresh" — Re-sync top events by volume (no active filter).
 *    Body: { mode: "refresh", limit?: number, category?: string }
 */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'discover';

    await pool.query(`CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);

    if (mode === 'discover') return await discoverMode(body);
    if (mode === 'new') return await newEventsMode(body);
    if (mode === 'refresh') return await refreshMode(body);

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Discovery mode: Sequential ID-ordered scan of ALL Polymarket events.
 * Always upserts — updates existing events with latest prices/resolution status.
 * No tag filters, no active filter — syncs EVERYTHING.
 */
async function discoverMode(body: any) {
  const maxPages = body.maxPages || 50;
  const pageSize = body.pageSize || 100;

  // Load or reset cursor
  let cursor: any = { offset: 0, totalSynced: 0, totalChecked: 0, completedAt: null, sweepCount: 0 };
  if (!body.resetCursor) {
    const { rows } = await pool.query(`SELECT data FROM api_cache WHERE key = 'gapfill_cursor'`);
    if (rows[0]) cursor = rows[0].data;
  }

  let offset = cursor.offset;
  let synced = 0;
  let skipped = 0;
  let page = 0;
  let finished = false;
  let firstError: string | undefined;

  while (page < maxPages) {
    const sp = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
      order: 'id',
      ascending: 'true',
    });

    const res = await fetch(`${GAMMA_API}/events?${sp}`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      firstError = `HTTP ${res.status} at offset ${offset}`;
      break;
    }

    const events: any[] = await res.json();
    if (events.length === 0) {
      finished = true;
      break;
    }

    for (const e of events) {
      if (CRYPTO_SERIES_RE.test(e.slug || '')) { skipped++; continue; }
      try {
        await upsertEvent(e);
        synced++;
      } catch (err) {
        skipped++;
        if (!firstError) firstError = `${e.slug}: ${(err as Error).message}`;
      }
    }

    offset += pageSize;
    page++;
    if (events.length < pageSize) {
      finished = true;
      break;
    }
  }

  // Update cursor
  cursor.offset = finished ? 0 : offset;
  cursor.totalSynced = (cursor.totalSynced || 0) + synced;
  cursor.totalChecked = (cursor.totalChecked || 0) + (synced + skipped);
  cursor.lastRun = new Date().toISOString();
  if (finished) {
    cursor.completedAt = new Date().toISOString();
    cursor.sweepCount = (cursor.sweepCount || 0) + 1;
    cursor.offset = 0;
  }

  await pool.query(
    `INSERT INTO api_cache (key, data, updated_at) VALUES ('gapfill_cursor', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify(cursor)]
  );

  return NextResponse.json({
    mode: 'discover',
    synced, skipped, pages: page, finished,
    cursor: { offset: cursor.offset, totalSynced: cursor.totalSynced, sweepCount: cursor.sweepCount },
    firstError: firstError || null,
  });
}

/**
 * New events mode: Quick check for events newer than our max DB ID.
 * No active filter — catches all new events including futures and resolved.
 */
async function newEventsMode(body: any) {
  const maxPages = body.maxPages || 10;
  const pageSize = 100;

  const { rows: maxRows } = await pool.query(`
    SELECT MAX(CAST(polymarket_id AS INTEGER)) as max_id
    FROM event_groups WHERE polymarket_id IS NOT NULL AND polymarket_id ~ '^[0-9]+$'
  `);
  const maxDbId = parseInt(maxRows[0]?.max_id) || 0;

  let synced = 0;
  let existing = 0;
  let page = 0;
  let firstError: string | undefined;

  for (let p = 0; p < maxPages; p++) {
    const sp = new URLSearchParams({
      limit: String(pageSize),
      offset: String(p * pageSize),
      order: 'id',
      ascending: 'false',
    });

    const res = await fetch(`${GAMMA_API}/events?${sp}`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) break;

    const events: any[] = await res.json();
    if (events.length === 0) break;

    let allOld = true;
    for (const e of events) {
      const eid = parseInt(e.id);
      if (eid <= maxDbId) {
        existing++;
        continue;
      }
      allOld = false;
      if (CRYPTO_SERIES_RE.test(e.slug || '')) continue;
      try {
        await upsertEvent(e);
        synced++;
      } catch (err) {
        if (!firstError) firstError = `${e.slug}: ${(err as Error).message}`;
      }
    }

    page++;
    if (allOld) break;
    if (events.length < pageSize) break;
  }

  return NextResponse.json({
    mode: 'new', synced, existing, pages: page, maxDbId,
    firstError: firstError || null,
  });
}

/**
 * Refresh mode: Re-sync top events by volume to update prices/stats/resolution.
 * No active filter — refreshes both active and recently closed events.
 */
async function refreshMode(body: any) {
  const limit = body.limit || 500;
  const category = body.category || null;
  const pageSize = 100;

  let synced = 0;
  let firstError: string | undefined;
  const pages = Math.ceil(limit / pageSize);

  for (let p = 0; p < pages; p++) {
    const sp = new URLSearchParams({
      limit: String(pageSize),
      offset: String(p * pageSize),
      order: 'volume24hr',
      ascending: 'false',
    });
    if (category) sp.set('tag_slug', category);

    const res = await fetch(`${GAMMA_API}/events?${sp}`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) break;

    const events: any[] = await res.json();
    if (events.length === 0) break;

    for (const e of events) {
      if (CRYPTO_SERIES_RE.test(e.slug || '')) continue;
      try {
        await upsertEvent(e);
        synced++;
      } catch (err) {
        if (!firstError) firstError = `${e.slug}: ${(err as Error).message}`;
      }
    }

    if (events.length < pageSize) break;
  }

  return NextResponse.json({
    mode: 'refresh', synced, pages,
    firstError: firstError || null,
  });
}

// ── Upsert logic ──

async function upsertEvent(e: any) {
  const allMarkets = e.markets || [];
  if (allMarkets.length === 0) return;

  const markets = allMarkets.slice(0, MAX_MARKETS_PER_EVENT);
  const isMulti = allMarkets.length > 1 || e.negRisk;
  const tagList = (e.tags || []).map((t: any) => ({ slug: t.slug, label: t.label }));
  const tags = JSON.stringify(tagList);

  const rawCategory = e.category;
  const category = (rawCategory && rawCategory !== 'None')
    ? rawCategory
    : deriveCategoryFromTags(tagList) || 'General';

  let eventGroupId: string | null = null;

  if (isMulti) {
    const { rows } = await pool.query(`
      INSERT INTO event_groups (
        polymarket_id, title, slug, description, category, tags, image_url, end_date_iso,
        volume, volume_24hr, liquidity, neg_risk,
        comment_count, competitive, volume_1wk, volume_1mo, featured, open_interest, start_date,
        created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
        title = EXCLUDED.title, slug = EXCLUDED.slug, description = EXCLUDED.description,
        category = EXCLUDED.category, tags = EXCLUDED.tags, image_url = EXCLUDED.image_url,
        volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
        liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
        comment_count = EXCLUDED.comment_count, competitive = EXCLUDED.competitive,
        volume_1wk = EXCLUDED.volume_1wk, volume_1mo = EXCLUDED.volume_1mo,
        featured = EXCLUDED.featured, open_interest = EXCLUDED.open_interest,
        start_date = EXCLUDED.start_date,
        created_at = EXCLUDED.created_at
      RETURNING id
    `, [
      e.id, e.title, e.slug,
      e.description || null, category, tags,
      e.image || null, e.endDate || null,
      e.volume || 0, e.volume24hr || 0, e.liquidity || 0,
      e.negRisk || false,
      e.commentCount || 0, e.competitive || 0,
      e.volume1wk || 0, e.volume1mo || 0,
      e.featured || false, e.openInterest || 0,
      e.startDate || null,
      e.createdAt || new Date().toISOString(),
    ]);
    eventGroupId = rows[0].id;
  }

  const mktValues: any[] = [];
  const mktPlaceholders: string[] = [];
  const cols = 35;
  let pi = 1;

  for (const m of markets) {
    const baseSlug = m.slug || e.slug;
    const ph = [];
    for (let c = 0; c < cols; c++) ph.push(`$${pi++}`);
    mktPlaceholders.push(`(${ph.join(',')})`);
    mktValues.push(
      m.id, m.conditionId || '', m.question,
      m.groupItemTitle || null, m.description || null,
      m.category || category, tags,
      baseSlug, m.image || e.image || null,
      m.resolutionSource || null,
      m.orderPriceMinTickSize || 0.01, m.orderMinSize || 5,
      m.active !== false, m.closed || false,
      !!m.closedTime, m.active !== false && !m.closed,
      m.endDate || e.endDate || null,
      parseFloat(m.volume) || 0, m.volume24hr || 0,
      parseFloat(m.liquidity) || 0, e.negRisk || false,
      eventGroupId,
      m.bestBid || 0, m.bestAsk || 0,
      m.spread || 0, m.lastTradePrice || 0,
      m.oneHourPriceChange || 0, m.oneDayPriceChange || 0,
      m.oneWeekPriceChange || 0, m.oneMonthPriceChange || 0,
      m.competitive || 0,
      m.volume1wk || 0, m.volume1mo || 0,
      m.submitted_by || null,
      m.createdAt || e.createdAt || new Date().toISOString(),
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
        end_date_iso, volume, volume_24hr, liquidity, neg_risk, event_group_id,
        best_bid, best_ask, spread, last_trade_price,
        price_change_1h, price_change_24h, price_change_1w, price_change_1m,
        competitive, volume_1wk, volume_1mo, submitted_by,
        created_at
      ) VALUES ${mktPlaceholders.join(',')}
      ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
        question = EXCLUDED.question, group_item_title = EXCLUDED.group_item_title,
        category = EXCLUDED.category, active = EXCLUDED.active, closed = EXCLUDED.closed,
        resolved = EXCLUDED.resolved, accepting_orders = EXCLUDED.accepting_orders,
        volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
        liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
        tags = EXCLUDED.tags, event_group_id = EXCLUDED.event_group_id,
        best_bid = EXCLUDED.best_bid, best_ask = EXCLUDED.best_ask,
        spread = EXCLUDED.spread, last_trade_price = EXCLUDED.last_trade_price,
        price_change_1h = EXCLUDED.price_change_1h, price_change_24h = EXCLUDED.price_change_24h,
        price_change_1w = EXCLUDED.price_change_1w, price_change_1m = EXCLUDED.price_change_1m,
        competitive = EXCLUDED.competitive, volume_1wk = EXCLUDED.volume_1wk, volume_1mo = EXCLUDED.volume_1mo,
        submitted_by = EXCLUDED.submitted_by,
        created_at = EXCLUDED.created_at
      RETURNING id, polymarket_id
    `, mktValues));
  } catch (err: any) {
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
              end_date_iso, volume, volume_24hr, liquidity, neg_risk, event_group_id,
              best_bid, best_ask, spread, last_trade_price,
              price_change_1h, price_change_24h, price_change_1w, price_change_1m,
              competitive, volume_1wk, volume_1mo, submitted_by,
              created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
            ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
              question = EXCLUDED.question, group_item_title = EXCLUDED.group_item_title,
              category = EXCLUDED.category, active = EXCLUDED.active, closed = EXCLUDED.closed,
              resolved = EXCLUDED.resolved, accepting_orders = EXCLUDED.accepting_orders,
              volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
              liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
              tags = EXCLUDED.tags, event_group_id = EXCLUDED.event_group_id,
              best_bid = EXCLUDED.best_bid, best_ask = EXCLUDED.best_ask,
              spread = EXCLUDED.spread, last_trade_price = EXCLUDED.last_trade_price,
              price_change_1h = EXCLUDED.price_change_1h, price_change_24h = EXCLUDED.price_change_24h,
              price_change_1w = EXCLUDED.price_change_1w, price_change_1m = EXCLUDED.price_change_1m,
              competitive = EXCLUDED.competitive, volume_1wk = EXCLUDED.volume_1wk, volume_1mo = EXCLUDED.volume_1mo,
              submitted_by = EXCLUDED.submitted_by,
              created_at = EXCLUDED.created_at
            RETURNING id, polymarket_id
          `, [
            m.id, m.conditionId || '', m.question,
            m.groupItemTitle || null, m.description || null,
            m.category || category, tags,
            `${baseSlug}-${m.id.slice(0, 8)}`, m.image || e.image || null,
            m.resolutionSource || null,
            m.orderPriceMinTickSize || 0.01, m.orderMinSize || 5,
            m.active !== false, m.closed || false,
            !!m.closedTime, m.active !== false && !m.closed,
            m.endDate || e.endDate || null,
            parseFloat(m.volume) || 0, m.volume24hr || 0,
            parseFloat(m.liquidity) || 0, e.negRisk || false,
            eventGroupId,
            m.bestBid || 0, m.bestAsk || 0,
            m.spread || 0, m.lastTradePrice || 0,
            m.oneHourPriceChange || 0, m.oneDayPriceChange || 0,
            m.oneWeekPriceChange || 0, m.oneMonthPriceChange || 0,
            m.competitive || 0,
            m.volume1wk || 0, m.volume1mo || 0,
            m.submitted_by || null,
            m.createdAt || e.createdAt || new Date().toISOString(),
          ]);
          marketRows.push(rows[0]);
        } catch { /* skip */ }
      }
    } else {
      throw err;
    }
  }

  const idMap = new Map<string, string>();
  for (const row of marketRows) idMap.set(row.polymarket_id, row.id);

  // Batch upsert tokens
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
      tokenPlaceholders.push(`($${tidx},$${tidx + 1},$${tidx + 2},$${tidx + 3},$${tidx + 4})`);
      tokenValues.push(dbId, tokenIds[i] || `${m.id}-${i}`, outcomes[i], prices[i] || 0.5, m.groupItemTitle || null);
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
