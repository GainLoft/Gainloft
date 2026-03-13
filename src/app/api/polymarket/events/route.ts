import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { Market, Token } from '@/lib/types';

export const preferredRegion = 'sin1';

const SPORTS_TAGS = ['sports', 'games', 'esports'];

// Abbreviation map — only things an algorithm can't figure out
const ABBREVIATIONS: Record<string, string[]> = {
  btc: ['bitcoin'], eth: ['ethereum'], sol: ['solana'],
  xrp: ['ripple'], doge: ['dogecoin'], ada: ['cardano'],
  dot: ['polkadot'], bnb: ['binance'], ai: ['artificial intelligence'],
  gpt: ['openai', 'chatgpt'], fed: ['federal reserve'],
  fomc: ['federal reserve'], cpi: ['consumer price index'],
  gdp: ['gross domestic product'], nfl: ['football'],
  nba: ['basketball'], mlb: ['baseball'], ufc: ['mixed martial arts'],
  f1: ['formula 1'], epl: ['premier league'], ucl: ['champions league'],
  ww3: ['world war'], uk: ['united kingdom'], eu: ['european union'],
  usa: ['united states'], us: ['united states'],
};

/**
 * Expand abbreviations and build PostgreSQL full-text search query.
 * Returns { ilike: string[], tsquery: string }
 *   - ilike: array of ILIKE patterns for fuzzy substring matching
 *   - tsquery: PostgreSQL full-text search query with stemming
 */
function buildSearchTerms(raw: string): { ilike: string[]; tsquery: string; useWordBoundary: boolean } {
  const q = raw.toLowerCase().trim();
  const patterns = new Set<string>([q]);

  // Expand abbreviations
  for (const word of q.split(/\s+/)) {
    if (ABBREVIATIONS[word]) {
      for (const expanded of ABBREVIATIONS[word]) patterns.add(expanded);
    }
  }
  if (ABBREVIATIONS[q]) {
    for (const expanded of ABBREVIATIONS[q]) patterns.add(expanded);
  }

  // Build tsquery: each word joined with & (AND), multiple expansions joined with | (OR)
  const words = q.split(/\s+/).filter(Boolean);
  const tsWords = words.map(w => `${w}:*`).join(' & ');
  const tsParts = [tsWords];
  // Add abbreviation expansions as OR alternatives
  const patternArr = Array.from(patterns);
  for (const p of patternArr) {
    if (p !== q) {
      const pw = p.split(/\s+/).filter(Boolean).map(w => `${w}:*`).join(' & ');
      tsParts.push(pw);
    }
  }
  const tsquery = tsParts.join(' | ');

  // For short terms (<=3 chars), use word-boundary regex instead of ILIKE
  // to avoid false positives (e.g. "ai" matching "Iran")
  const ilikeTerms = Array.from(patterns);
  const useWordBoundary = q.length <= 3 && !ABBREVIATIONS[q];

  return { ilike: ilikeTerms, tsquery, useWordBoundary };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const order = url.searchParams.get('order') || 'volume24hr';
  const tag = url.searchParams.get('tag') || undefined;
  const active = url.searchParams.get('active');
  const closed = url.searchParams.get('closed');
  const category = url.searchParams.get('category') || undefined;
  const search = url.searchParams.get('search') || undefined;

  // Sports pages should still show sports — only exclude when not browsing a sports category
  const isSportsCategory = tag ? SPORTS_TAGS.includes(tag) : false;

  try {
    const orderCol = order === 'newest' ? 'created_at' : order === 'volume' ? 'volume' : order === 'liquidity' ? 'liquidity' : 'volume_24hr';
    const orderDir = order === 'endDate' ? 'ASC NULLS LAST' : 'DESC';
    const fetchLimit = limit + offset;

    // ── Query 1: Event groups ──
    const egWhere: string[] = ['eg.polymarket_id IS NOT NULL'];
    const egParams: any[] = [];
    let ei = 1;

    // Global: exclude auto-generated junk (hide-from-new) from ALL pages
    egWhere.push(`NOT (eg.tags @> $${ei++}::jsonb)`);
    egParams.push(JSON.stringify([{ slug: 'hide-from-new' }]));

    // Global: exclude recurring crypto Up/Down series windows
    egWhere.push(`eg.slug !~ $${ei++}`);
    egParams.push('^(btc|eth|sol|xrp|doge|bnb|ada|dot|avax|matic|link|bitcoin|ethereum|solana|dogecoin)-(updown|up-or-down)-');

    // Global: exclude sports/games/esports unless browsing a sports category
    if (!isSportsCategory) {
      egWhere.push(`NOT (eg.tags @> $${ei++}::jsonb) AND NOT (eg.tags @> $${ei++}::jsonb) AND NOT (eg.tags @> $${ei++}::jsonb)`);
      egParams.push(JSON.stringify([{ slug: 'sports' }]), JSON.stringify([{ slug: 'games' }]), JSON.stringify([{ slug: 'esports' }]));
    }

    // Filter event groups by active/closed status
    if (order === 'newest' || active === 'true') {
      egWhere.push(`EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.active = true)`);
    } else {
      // Exclude event groups where ALL child markets are closed/resolved
      egWhere.push(`EXISTS (SELECT 1 FROM markets m WHERE m.event_group_id = eg.id AND m.closed = false)`);
    }

    if (category) {
      egWhere.push(`(eg.category ILIKE $${ei} OR eg.tags @> $${ei + 1}::jsonb)`);
      egParams.push(`%${category}%`, JSON.stringify([{ label: category }]));
      ei += 2;
    }
    if (tag) {
      egWhere.push(`eg.tags @> $${ei++}::jsonb`);
      egParams.push(JSON.stringify([{ slug: tag }]));
    }
    if (search) {
      const { ilike, tsquery, useWordBoundary } = buildSearchTerms(search);
      const clauses: string[] = [];
      for (const term of ilike) {
        if (useWordBoundary && term === search.toLowerCase().trim()) {
          const regex = `\\m${term}\\M`;
          clauses.push(`eg.title ~* $${ei}`);
          clauses.push(`eg.slug ~* $${ei}`);
          clauses.push(`eg.category ~* $${ei}`);
          clauses.push(`eg.tags::text ~* $${ei}`);
          egParams.push(regex);
        } else {
          clauses.push(`eg.title ILIKE $${ei}`);
          clauses.push(`eg.slug ILIKE $${ei}`);
          clauses.push(`eg.description ILIKE $${ei}`);
          clauses.push(`eg.category ILIKE $${ei}`);
          clauses.push(`eg.tags::text ILIKE $${ei}`);
          egParams.push(`%${term}%`);
        }
        ei++;
      }
      // Normalized match: strip punctuation so "pumpfun" matches "Pump.fun"
      const normalized = search.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (normalized.length >= 3) {
        clauses.push(`regexp_replace(lower(eg.title), '[^a-z0-9]', '', 'g') ILIKE $${ei}`);
        clauses.push(`regexp_replace(lower(eg.slug), '[^a-z0-9]', '', 'g') ILIKE $${ei}`);
        egParams.push(`%${normalized}%`);
        ei++;
      }
      // Full-text search with stemming
      clauses.push(`to_tsvector('english', coalesce(eg.title,'') || ' ' || coalesce(eg.description,'') || ' ' || coalesce(eg.category,'')) @@ to_tsquery('english', $${ei})`);
      egParams.push(tsquery);
      ei++;
      egWhere.push(`(${clauses.join(' OR ')})`);
    }

    egParams.push(fetchLimit);
    const egQuery = `
      SELECT eg.id, eg.title, eg.slug, eg.description, eg.category, eg.tags,
        eg.image_url, eg.end_date_iso, eg.volume, eg.volume_24hr, eg.liquidity,
        eg.neg_risk, eg.comment_count, eg.competitive, eg.volume_1wk, eg.volume_1mo,
        eg.featured, eg.open_interest, eg.start_date, eg.created_at
      FROM event_groups eg
      WHERE ${egWhere.join(' AND ')}
      ORDER BY eg.${orderCol} ${orderDir}
      LIMIT $${ei}
    `;

    // ── Query 2: Standalone markets ──
    const mWhere: string[] = ['m.polymarket_id IS NOT NULL', 'm.event_group_id IS NULL'];
    const mParams: any[] = [];
    let mi = 1;

    // Global: exclude ALL recurring crypto Up/Down series windows
    // Catches both short slugs (btc-updown-5m-*) and long slugs (bitcoin-up-or-down-march-*)
    mWhere.push(`m.slug !~ $${mi++}`);
    mParams.push('^(btc|eth|sol|xrp|doge|bnb|ada|dot|avax|matic|link|bitcoin|ethereum|solana|dogecoin)-(updown|up-or-down)-');

    // Global: exclude hide-from-new
    mWhere.push(`NOT (m.tags @> $${mi++}::jsonb)`);
    mParams.push(JSON.stringify([{ slug: 'hide-from-new' }]));

    // Global: exclude sports unless browsing sports category
    if (!isSportsCategory) {
      mWhere.push(`NOT (m.tags @> $${mi++}::jsonb) AND NOT (m.tags @> $${mi++}::jsonb) AND NOT (m.tags @> $${mi++}::jsonb)`);
      mParams.push(JSON.stringify([{ slug: 'sports' }]), JSON.stringify([{ slug: 'games' }]), JSON.stringify([{ slug: 'esports' }]));
    }

    // Filter standalone markets by active/closed status
    if (order === 'newest') {
      mWhere.push('m.active = true');
    } else if (active !== null) {
      // handled below
    } else if (closed === null) {
      // Default: hide closed/resolved markets from browse pages
      mWhere.push('m.closed = false');
    }

    if (active !== null) {
      mWhere.push(`m.active = $${mi++}`);
      mParams.push(active === 'true');
    }
    if (closed !== null) {
      mWhere.push(`m.closed = $${mi++}`);
      mParams.push(closed === 'true');
    }
    if (category) {
      mWhere.push(`(m.category ILIKE $${mi} OR m.tags @> $${mi + 1}::jsonb)`);
      mParams.push(`%${category}%`, JSON.stringify([{ label: category }]));
      mi += 2;
    }
    if (tag) {
      mWhere.push(`m.tags @> $${mi++}::jsonb`);
      mParams.push(JSON.stringify([{ slug: tag }]));
    }
    if (search) {
      const { ilike, tsquery, useWordBoundary } = buildSearchTerms(search);
      const clauses: string[] = [];
      for (const term of ilike) {
        if (useWordBoundary && term === search.toLowerCase().trim()) {
          const regex = `\\m${term}\\M`;
          clauses.push(`m.question ~* $${mi}`);
          clauses.push(`m.slug ~* $${mi}`);
          clauses.push(`m.category ~* $${mi}`);
          clauses.push(`m.tags::text ~* $${mi}`);
          mParams.push(regex);
        } else {
          clauses.push(`m.question ILIKE $${mi}`);
          clauses.push(`m.slug ILIKE $${mi}`);
          clauses.push(`m.description ILIKE $${mi}`);
          clauses.push(`m.category ILIKE $${mi}`);
          clauses.push(`m.tags::text ILIKE $${mi}`);
          mParams.push(`%${term}%`);
        }
        mi++;
      }
      // Normalized match: strip punctuation so "pumpfun" matches "Pump.fun"
      const normalized = search.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (normalized.length >= 3) {
        clauses.push(`regexp_replace(lower(m.question), '[^a-z0-9]', '', 'g') ILIKE $${mi}`);
        clauses.push(`regexp_replace(lower(m.slug), '[^a-z0-9]', '', 'g') ILIKE $${mi}`);
        mParams.push(`%${normalized}%`);
        mi++;
      }
      // Full-text search with stemming
      clauses.push(`to_tsvector('english', coalesce(m.question,'') || ' ' || coalesce(m.description,'') || ' ' || coalesce(m.category,'')) @@ to_tsquery('english', $${mi})`);
      mParams.push(tsquery);
      mi++;
      mWhere.push(`(${clauses.join(' OR ')})`);
    }

    mParams.push(fetchLimit);
    const mQuery = `
      SELECT m.id, m.question, m.slug, m.description, m.category, m.tags,
        m.image_url, m.end_date_iso, m.volume, m.volume_24hr, m.liquidity,
        m.neg_risk, m.created_at, m.active, m.closed, m.resolved, m.winning_outcome,
        m.best_bid, m.best_ask, m.spread, m.last_trade_price,
        m.price_change_1h, m.price_change_24h, m.price_change_1w, m.price_change_1m,
        m.competitive, m.volume_1wk, m.volume_1mo, m.submitted_by
      FROM markets m
      WHERE ${mWhere.join(' AND ')}
      ORDER BY m.${orderCol} ${orderDir}
      LIMIT $${mi}
    `;

    // Run both queries in parallel
    const [egResult, mResult] = await Promise.all([
      pool.query(egQuery, egParams),
      pool.query(mQuery, mParams),
    ]);

    const egRows = egResult.rows;
    const mRows = mResult.rows;

    // ── Load tokens for event groups (top 6 per group) ──
    const groupIds = egRows.map(r => r.id);
    const tokensByGroup: Record<string, { tokens: Token[]; meta: { active: boolean; closed: boolean; winning: string | null } }> = {};

    if (groupIds.length > 0) {
      const { rows: subRows } = await pool.query(`
        SELECT m.event_group_id, m.group_item_title, m.question AS mq,
          m.active, m.closed, m.winning_outcome,
          t.token_id, t.price
        FROM markets m
        JOIN tokens t ON t.market_id = m.id AND t.outcome = 'Yes'
        WHERE m.event_group_id = ANY($1)
        ORDER BY t.price DESC
      `, [groupIds]);

      for (const r of subRows) {
        const gid = r.event_group_id;
        if (!tokensByGroup[gid]) {
          tokensByGroup[gid] = { tokens: [], meta: { active: false, closed: true, winning: null } };
        }
        const g = tokensByGroup[gid];
        if (r.active) g.meta.active = true;
        if (!r.closed) g.meta.closed = false;
        if (r.winning_outcome) g.meta.winning = r.winning_outcome;
        if (g.tokens.length < 6) {
          g.tokens.push({
            id: r.token_id, token_id: r.token_id,
            outcome: 'Yes', label: r.group_item_title || r.mq,
            price: parseFloat(r.price),
          });
        }
      }
    }

    // ── Load tokens for standalone markets ──
    const standaloneIds = mRows.map(r => r.id);
    const tokensByMarket: Record<string, Token[]> = {};

    if (standaloneIds.length > 0) {
      const { rows: tokenRows } = await pool.query(
        `SELECT market_id, token_id, outcome, price, label FROM tokens WHERE market_id = ANY($1)`,
        [standaloneIds]
      );
      for (const t of tokenRows) {
        if (!tokensByMarket[t.market_id]) tokensByMarket[t.market_id] = [];
        tokensByMarket[t.market_id].push({
          id: t.token_id, token_id: t.token_id,
          outcome: t.outcome, price: parseFloat(t.price),
          label: t.label || undefined,
        });
      }
    }

    // ── Build results ──
    const groupCards: Market[] = egRows.map(eg => {
      const g = tokensByGroup[eg.id];
      return {
        id: eg.id, condition_id: '', question_id: '',
        question: eg.title, description: eg.description || null,
        category: eg.category, tags: eg.tags || [], slug: eg.slug,
        image_url: eg.image_url || null, resolution_source: null,
        tokens: g?.tokens || [],
        minimum_tick_size: 0.01, minimum_order_size: 5,
        active: g?.meta.active ?? false, closed: g?.meta.closed ?? true,
        resolved: false, winning_outcome: g?.meta.winning || null,
        resolved_at: null, accepting_orders: g?.meta.active ?? false,
        end_date_iso: eg.end_date_iso || null,
        volume: parseFloat(eg.volume) || 0, volume_24hr: parseFloat(eg.volume_24hr) || 0,
        volume_1wk: parseFloat(eg.volume_1wk) || 0, volume_1mo: parseFloat(eg.volume_1mo) || 0,
        liquidity: parseFloat(eg.liquidity) || 0, neg_risk: eg.neg_risk || false,
        comment_count: parseInt(eg.comment_count) || 0, competitive: parseFloat(eg.competitive) || 0,
        created_at: eg.created_at,
      };
    });

    const standaloneCards: Market[] = mRows.map(row => ({
      id: row.id, condition_id: '', question_id: '',
      question: row.question, description: row.description || null,
      category: row.category, tags: row.tags || [], slug: row.slug,
      image_url: row.image_url || null, resolution_source: null,
      tokens: tokensByMarket[row.id] || [],
      minimum_tick_size: 0.01, minimum_order_size: 5,
      active: row.active, closed: row.closed,
      resolved: row.resolved || false, winning_outcome: row.winning_outcome || null,
      resolved_at: null, accepting_orders: row.active,
      end_date_iso: row.end_date_iso || null,
      volume: parseFloat(row.volume) || 0, volume_24hr: parseFloat(row.volume_24hr) || 0,
      volume_1wk: parseFloat(row.volume_1wk) || 0, volume_1mo: parseFloat(row.volume_1mo) || 0,
      liquidity: parseFloat(row.liquidity) || 0, neg_risk: row.neg_risk || false,
      best_bid: parseFloat(row.best_bid) || 0, best_ask: parseFloat(row.best_ask) || 0,
      spread: parseFloat(row.spread) || 0, last_trade_price: parseFloat(row.last_trade_price) || 0,
      price_change_24h: parseFloat(row.price_change_24h) || 0,
      competitive: parseFloat(row.competitive) || 0,
      comment_count: parseInt(row.comment_count) || 0,
      created_at: row.created_at,
    }));

    // Merge, sort, paginate
    const all = [...groupCards, ...standaloneCards];
    all.sort((a, b) => {
      if (order === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (order === 'volume') return b.volume - a.volume;
      if (order === 'liquidity') return b.liquidity - a.liquidity;
      if (order === 'endDate') return new Date(a.end_date_iso || '9999').getTime() - new Date(b.end_date_iso || '9999').getTime();
      return b.volume_24hr - a.volume_24hr;
    });

    return NextResponse.json(all.slice(offset, offset + limit), {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  } catch (err) {
    console.error('Events fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
