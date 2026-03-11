import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const preferredRegion = 'sin1';

const GAMMA_API = 'https://gamma-api.polymarket.com';

// Top tags to sync — keep it lean for quick mode
const SPORT_TAGS: { tag: string; quickPages: number }[] = [
  { tag: 'sports', quickPages: 1 },
  { tag: 'esports', quickPages: 1 },
];

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

  // Use a single dedicated client for all writes (avoids pool exhaustion on transaction pooler)
  const client = await pool.connect();
  try {
    for (const { tag, quickPages } of SPORT_TAGS) {
      const pageSize = 100;
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
              await upsertEvent(client, e);
              totalSynced++;
            } catch {
              totalSkipped++;
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
    let totalResolved = 0;
    try {
      const { rows: activeMarkets } = await client.query(`
        SELECT id, polymarket_id FROM markets
        WHERE polymarket_id IS NOT NULL AND closed = false
        ORDER BY created_at DESC LIMIT 200
      `);
      for (const market of activeMarkets) {
        try {
          const res = await fetch(
            `${GAMMA_API}/markets/${market.polymarket_id}`,
            { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          if (!res.ok) continue;
          const pm = await res.json();
          if (pm.closed || !pm.active) {
            await client.query(`
              UPDATE markets SET closed = true, resolved = true, active = false, accepting_orders = false
              WHERE id = $1
            `, [market.id]);
            totalResolved++;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

  } finally {
    client.release();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  return NextResponse.json({
    totalSynced,
    totalSkipped,
    totalResolved,
    totalPages,
    duration: `${duration}s`,
  });
}

// ── Upsert logic (same as sync/route.ts but inline to avoid HTTP calls) ──

async function upsertEvent(client: any, e: any) {
  const markets = e.markets || [];
  if (markets.length === 0) return;

  const isMulti = markets.length > 1 || e.negRisk;
  const tags = JSON.stringify((e.tags || []).map((t: any) => ({ slug: t.slug, label: t.label })));

  let eventGroupId: string | null = null;

  if (isMulti) {
    const { rows } = await client.query(`
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

  for (const m of markets) {
    await upsertMarket(client, m, e, tags, eventGroupId);
  }
}

async function upsertMarket(client: any, m: any, e: any, tags: string, eventGroupId: string | null) {
  const baseSlug = m.slug || e.slug;
  let rows: any[];
  try {
    ({ rows } = await client.query(`
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
      RETURNING id
    `, [
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
    ]));
  } catch (slugErr: any) {
    if (slugErr.code === '23505' && slugErr.constraint?.includes('slug')) {
      ({ rows } = await client.query(`
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
        RETURNING id
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
      ]));
    } else {
      throw slugErr;
    }
  }

  const marketDbId = rows[0].id;

  // Upsert tokens
  const outcomes = parseField(m.outcomes, ['Yes', 'No']);
  const prices = parseField(m.outcomePrices, []).map(Number);
  const tokenIds = parseField(m.clobTokenIds, []);

  for (let i = 0; i < outcomes.length; i++) {
    const tokenId = tokenIds[i] || `${m.id}-${i}`;
    try {
      await client.query(`
        INSERT INTO tokens (market_id, token_id, outcome, price, label)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (market_id, outcome) DO UPDATE SET
          token_id = EXCLUDED.token_id, price = EXCLUDED.price, label = EXCLUDED.label
      `, [marketDbId, tokenId, outcomes[i], prices[i] || 0.5, m.groupItemTitle || null]);
    } catch (tokenErr: any) {
      if (tokenErr.code === '23505') {
        await client.query(`
          UPDATE tokens SET price = $1, label = $2
          WHERE market_id = $3 AND outcome = $4
        `, [prices[i] || 0.5, m.groupItemTitle || null, marketDbId, outcomes[i]]);
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
