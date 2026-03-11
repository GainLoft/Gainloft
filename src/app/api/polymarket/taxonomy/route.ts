import { NextResponse } from 'next/server';

/**
 * Fetches sidebar data from Polymarket by scraping __NEXT_DATA__ from category pages.
 * This gives us the exact same sidebar items, ordering, and counts as Polymarket.
 *
 * Data sources (in priority order):
 *   1. Dedicated counts query (crypto-counts, finance-counts) — has counts + items
 *   2. filteredTagsBySlug — the per-category subcategory list Polymarket actually displays
 *   3. taxonomy query — fallback with market_count from rows
 *
 * Query params:
 *   category - our local category slug (e.g., "crypto", "culture")
 *   pmPath   - (optional) Polymarket URL path override (e.g., "/pop-culture")
 */

// Only needed for categories with non-standard PM URL paths
const PM_PATH_OVERRIDES: Record<string, string> = {
  sports: '/sports/live',
};

// Counts query key → slug mapping for keys that don't match their URL slug
const COUNTS_KEY_TO_SLUG: Record<string, string> = {
  fiveM: '5m',
  fifteenM: '15m',
  fourhour: '4hour',
  'earnings-calls': 'earnings-calls',
  'fed-rates': 'fed-rates',
  'prediction-markets': 'prediction-markets',
};

// Well-known labels for slugs
const SLUG_LABELS: Record<string, string> = {
  // Crypto timeframes
  '5m': '5 Min',
  '15m': '15 Min',
  '4hour': '4 Hour',
  'pre-market': 'Pre-Market',
  // Crypto assets
  ai: 'AI', ath: 'ATH', bnb: 'BNB', cex: 'CEX', etf: 'ETF', ftx: 'FTX',
  xrp: 'XRP', aave: 'AAVE', ipo: 'IPO',
  microstrategy: 'MicroStrategy', hyperliquid: 'Hyperliquid',
  // Finance
  'fed-rates': 'Fed Rates', 'earnings-calls': 'Earnings Calls',
  'prediction-markets': 'Prediction Markets', indicies: 'Indices',
  // Politics
  ice: 'ICE', tsa: 'TSA', 'trump-machado': 'Trump-Machado',
  // Economy
  cpi: 'CPI', gdp: 'GDP', nfp: 'NFP', fed: 'Fed',
  // Tech
  openai: 'OpenAI', deepseek: 'DeepSeek', spacex: 'SpaceX', xai: 'xAI',
  // Culture
  mrbeast: 'MrBeast', netflix: 'Netflix', spotify: 'Spotify',
  // Sports
  mlb: 'MLB', nba: 'NBA', nfl: 'NFL', nhl: 'NHL', ufc: 'UFC',
  cbb: 'CBB', cwbb: 'CWBB', ppa: 'PPA', wbc: 'WBC', epl: 'EPL',
  // Climate
  'climate-science': 'Climate & Science',
  // General
  doj: 'DOJ', neh: 'NEH', cftc: 'CFTC', psg: 'PSG',
};

function slugToLabel(slug: string): string {
  if (SLUG_LABELS[slug]) return SLUG_LABELS[slug];
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface SidebarItem {
  slug: string;
  label: string;
  count?: number;
}

interface DehydratedQuery {
  queryKey: string[];
  state: { data: unknown };
}

interface TaxonomyRow {
  market_category: string;
  market_subcategory: string;
  market_count: number;
  total_volume: number;
}

interface TaxonomyData {
  categories: string[];
  subcategoriesByCategory: Record<string, string[]>;
  rows: TaxonomyRow[];
}

interface FilteredTag {
  slug: string;
  label: string;
}

// In-memory cache: category → { items, allCount, timestamp }
const cache: Record<string, { items: SidebarItem[]; allCount?: number; ts: number }> = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

interface PageData {
  queries: DehydratedQuery[];
  sidebarOrder: string[];  // sidebar link slugs scraped from HTML, in display order
}

async function fetchPageData(pmPath: string): Promise<PageData> {
  const res = await fetch(`https://polymarket.com${pmPath}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    cache: 'no-store',
  });
  if (!res.ok) return { queries: [], sidebarOrder: [] };
  const html = await res.text();

  // Extract __NEXT_DATA__ queries
  let queries: DehydratedQuery[] = [];
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (match) {
    try {
      const nextData = JSON.parse(match[1]);
      queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
    } catch { /* ignore */ }
  }

  // Extract sidebar link order from rendered HTML (e.g., href="/crypto/5M", href="/crypto/daily")
  const basePath = pmPath.replace(/\/$/, '');
  const linkPattern = new RegExp(`href="${basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^"?]+)"`, 'g');
  const sidebarOrder: string[] = [];
  const seen = new Set<string>();
  let linkMatch;
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const slug = linkMatch[1].toLowerCase();
    if (!seen.has(slug)) {
      seen.add(slug);
      sidebarOrder.push(slug);
    }
  }

  return { queries, sidebarOrder };
}

function formatCountsItems(data: Record<string, string | number>, sidebarOrder: string[]): { items: SidebarItem[]; allCount?: number } {
  const items: SidebarItem[] = [];
  let allCount: number | undefined;
  for (const [key, val] of Object.entries(data)) {
    const count = typeof val === 'string' ? parseInt(val) : val;
    if (key === 'all') {
      allCount = count;
      continue;
    }
    if (count === 0) continue; // Skip empty categories
    const slug = COUNTS_KEY_TO_SLUG[key] || key;
    items.push({ slug, label: slugToLabel(slug), count });
  }

  // Sort items to match Polymarket's sidebar display order (scraped from HTML)
  if (sidebarOrder.length > 0) {
    const orderMap = new Map(sidebarOrder.map((s, i) => [s, i]));
    items.sort((a, b) => {
      const aIdx = orderMap.get(a.slug) ?? 999;
      const bIdx = orderMap.get(b.slug) ?? 999;
      return aIdx - bIdx;
    });
  }

  return { items, allCount };
}

function formatTaxonomyItems(data: TaxonomyData, pmCategory: string): SidebarItem[] {
  const rows = (data.rows || [])
    .filter(r => r.market_category === pmCategory && r.market_count > 0)
    .sort((a, b) => b.total_volume - a.total_volume);

  return rows.map(r => ({
    slug: r.market_subcategory,
    label: slugToLabel(r.market_subcategory),
    count: r.market_count,
  }));
}

// Map our local slug → taxonomy row key (for market_category field)
const TAXONOMY_KEY_MAP: Record<string, string> = {
  climate: 'climate-science',
};

async function fetchSidebarItems(category: string, pmPathParam?: string | null): Promise<{ items: SidebarItem[]; allCount?: number }> {
  // Check cache
  if (cache[category] && Date.now() - cache[category].ts < CACHE_TTL) {
    return { items: cache[category].items, allCount: cache[category].allCount };
  }

  const pmPath = pmPathParam || PM_PATH_OVERRIDES[category] || `/${category}`;
  const taxonomyKey = TAXONOMY_KEY_MAP[category] || category;
  const { queries, sidebarOrder } = await fetchPageData(pmPath);
  if (queries.length === 0) return { items: [] };

  let items: SidebarItem[] = [];
  let allCount: number | undefined;

  // Strategy 1: Look for dedicated counts query (crypto-counts, finance-counts, sportsPopularCounts, etc.)
  const countsQuery = queries.find((q: DehydratedQuery) => {
    const key = Array.isArray(q.queryKey) ? q.queryKey[0] : '';
    return typeof key === 'string' && (
      key.endsWith('-counts') ||
      key === 'sportsPopularCounts'
    );
  });

  if (countsQuery?.state?.data && typeof countsQuery.state.data === 'object') {
    const result = formatCountsItems(countsQuery.state.data as Record<string, string | number>, sidebarOrder);
    items = result.items;
    allCount = result.allCount;
  }

  // Strategy 2: Use filteredTagsBySlug — the per-category subcategory list
  // This is what Polymarket actually displays in their sidebar (correct items + order + labels)
  if (items.length === 0) {
    const tagsBySlugQuery = queries.find((q: DehydratedQuery) => {
      return Array.isArray(q.queryKey) && q.queryKey.includes('filteredTagsBySlug');
    });

    if (tagsBySlugQuery?.state?.data && Array.isArray(tagsBySlugQuery.state.data)) {
      const tags = tagsBySlugQuery.state.data as FilteredTag[];
      items = tags
        .filter(t => t.slug && t.slug !== 'all')
        .map(t => ({ slug: t.slug, label: t.label || slugToLabel(t.slug) }));
    }
  }

  // Strategy 3: Fall back to taxonomy query
  if (items.length === 0) {
    const taxonomyQuery = queries.find((q: DehydratedQuery) => {
      const key = Array.isArray(q.queryKey) ? q.queryKey[0] : '';
      return key === 'categoriesAndSubcategories' || key === 'taxonomy';
    });

    if (taxonomyQuery?.state?.data) {
      items = formatTaxonomyItems(taxonomyQuery.state.data as TaxonomyData, taxonomyKey);
    }
  }

  // Strategy 4: Fall back to filteredTags with rows
  if (items.length === 0) {
    const filteredTagsQuery = queries.find((q: DehydratedQuery) => {
      return Array.isArray(q.queryKey) && q.queryKey.includes('filteredTags');
    });

    if (filteredTagsQuery?.state?.data) {
      const data = filteredTagsQuery.state.data as TaxonomyData;
      if (data.rows) {
        items = formatTaxonomyItems(data, taxonomyKey);
      }
    }
  }

  // Cache the result
  cache[category] = { items, allCount, ts: Date.now() };
  return { items, allCount };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const pmPathParam = url.searchParams.get('pmPath');

  try {
    if (category) {
      const { items, allCount } = await fetchSidebarItems(category, pmPathParam);
      return NextResponse.json({ category, items, allCount }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    return NextResponse.json({ subcategoriesByCategory: {} }, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    });
  } catch (err) {
    console.error('Taxonomy fetch error:', err);
    return NextResponse.json({ subcategoriesByCategory: {} }, { status: 500 });
  }
}
