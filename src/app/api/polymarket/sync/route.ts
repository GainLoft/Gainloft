import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const maxDuration = 300; // 5 min for Pro plan
export const preferredRegion = 'sin1';

// GET = quick DB test
export async function GET() {
  try {
    const t0 = Date.now();
    const { rows } = await pool.query('SELECT NOW() as time, current_database() as db');
    const readMs = Date.now() - t0;
    return NextResponse.json({ ok: true, ...rows[0], readMs });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Bulk sync events from Polymarket gamma API into local DB.
 * Paginates through ALL events (100 per page) until exhausted.
 *
 * POST /api/polymarket/sync
 * Body (optional): { tag?: string, maxPages?: number }
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tag: string = body.tag || '';
    const maxPages: number = body.maxPages || 20;
    const startOffset: number = body.startOffset || 0;

    let offset = startOffset;
    const pageSize = 100;
    let totalSynced = 0;
    let totalSkipped = 0;
    let page = 0;
    let firstError: string | undefined;

    while (page < maxPages) {
      const sp = new URLSearchParams();
      if (tag) sp.set('tag_slug', tag);
      sp.set('limit', String(pageSize));
      sp.set('offset', String(offset));
      sp.set('order', 'volume24hr');
      sp.set('ascending', 'false');
      sp.set('active', 'true');

      const res = await fetch(`${GAMMA_API}/events?${sp.toString()}`, {
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

      offset += pageSize;
      page++;
      if (events.length < pageSize) break;
    }

    return NextResponse.json({ synced: totalSynced, skipped: totalSkipped, pages: page, firstError: firstError || null });
  } catch (err) {
    console.error('Sync error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// Shared upsert logic — imported from cron route pattern
const MAX_MARKETS_PER_EVENT = 30;

async function upsertEvent(e: any) {
  const allMarkets = e.markets || [];
  if (allMarkets.length === 0) return;

  const markets = allMarkets.slice(0, MAX_MARKETS_PER_EVENT);
  const isMulti = allMarkets.length > 1 || e.negRisk;
  const tags = JSON.stringify((e.tags || []).map((t: any) => ({ slug: t.slug, label: t.label })));

  let eventGroupId: string | null = null;

  if (isMulti) {
    const { rows } = await pool.query(`
      INSERT INTO event_groups (polymarket_id, title, slug, description, category, tags, image_url, end_date_iso, volume, volume_24hr, liquidity, neg_risk, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
        title = EXCLUDED.title, slug = EXCLUDED.slug, description = EXCLUDED.description,
        tags = EXCLUDED.tags, image_url = EXCLUDED.image_url,
        volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
        liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
        created_at = EXCLUDED.created_at
      RETURNING id
    `, [
      e.id, e.title, e.slug,
      e.description || null, e.category || 'General', tags,
      e.image || null, e.endDate || null,
      e.volume || 0, e.volume24hr || 0, e.liquidity || 0,
      e.negRisk || false,
      e.createdAt || new Date().toISOString(),
    ]);
    eventGroupId = rows[0].id;
  }

  // Batch upsert all markets
  const mktValues: any[] = [];
  const mktPlaceholders: string[] = [];
  const cols = 23;
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
        created_at
      ) VALUES ${mktPlaceholders.join(',')}
      ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
        question = EXCLUDED.question, group_item_title = EXCLUDED.group_item_title,
        active = EXCLUDED.active, closed = EXCLUDED.closed,
        resolved = EXCLUDED.resolved, accepting_orders = EXCLUDED.accepting_orders,
        volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
        liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
        tags = EXCLUDED.tags, event_group_id = EXCLUDED.event_group_id,
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
              created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
            ON CONFLICT (polymarket_id) WHERE polymarket_id IS NOT NULL DO UPDATE SET
              question = EXCLUDED.question, group_item_title = EXCLUDED.group_item_title,
              active = EXCLUDED.active, closed = EXCLUDED.closed,
              resolved = EXCLUDED.resolved, accepting_orders = EXCLUDED.accepting_orders,
              volume = EXCLUDED.volume, volume_24hr = EXCLUDED.volume_24hr,
              liquidity = EXCLUDED.liquidity, end_date_iso = EXCLUDED.end_date_iso,
              tags = EXCLUDED.tags, event_group_id = EXCLUDED.event_group_id,
              created_at = EXCLUDED.created_at
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

/**
 * PUT /api/polymarket/sync
 * Resolution sync: checks active DB markets against Polymarket API
 * and marks resolved/closed ones. Run periodically to clean up stale markets.
 */
export async function PUT() {
  try {
    // Get all active markets with polymarket_ids from DB
    const { rows: activeMarkets } = await pool.query(`
      SELECT id, polymarket_id FROM markets
      WHERE polymarket_id IS NOT NULL AND closed = false
      ORDER BY created_at DESC
      LIMIT 500
    `);

    if (activeMarkets.length === 0) {
      return NextResponse.json({ resolved: 0, checked: 0 });
    }

    let resolved = 0;

    // Check in batches of 50 against Gamma API
    const batchSize = 50;
    for (let i = 0; i < activeMarkets.length; i += batchSize) {
      const batch = activeMarkets.slice(i, i + batchSize);
      const ids = batch.map((m: any) => m.polymarket_id);

      // Fetch each market from Gamma API to check if closed
      for (const market of batch) {
        try {
          const res = await fetch(
            `${GAMMA_API}/markets/${market.polymarket_id}`,
            { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          if (!res.ok) continue;
          const pm = await res.json();

          if (pm.closed || !pm.active) {
            await pool.query(`
              UPDATE markets SET closed = true, resolved = true, active = false, accepting_orders = false
              WHERE id = $1
            `, [market.id]);
            resolved++;
          }
        } catch {
          // Skip individual market errors
        }
      }
    }

    return NextResponse.json({ resolved, checked: activeMarkets.length });
  } catch (err) {
    console.error('Resolution sync error:', err);
    return NextResponse.json({ error: 'Resolution sync failed' }, { status: 500 });
  }
}
