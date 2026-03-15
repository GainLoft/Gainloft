import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/polymarket/logos/scrape-polymarket
 *
 * Scrapes team logos directly from Polymarket's SSR HTML pages.
 * Extracts <img> tags with alt="ABBR icon" and resolves the S3 URLs.
 * Merges into existing team_logos_map (supplements, never overwrites ESPN/PandaScore).
 * Runs every 6 hours via Vercel cron.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface ScrapedLogo {
  abbr: string;       // team abbreviation from alt text (lowercase)
  s3Url: string;      // raw S3 URL
  league: string;     // league slug from the page URL (e.g., "nba", "epl")
}

/** Extract team logos from a Polymarket HTML page */
function extractLogos(html: string, leagueSlug: string): ScrapedLogo[] {
  const logos: ScrapedLogo[] = [];
  const seen = new Set<string>();

  // Step 1: Extract all <img ...> tags
  const imgTagRegex = /<img\s[^>]+>/gi;
  let tagMatch;
  while ((tagMatch = imgTagRegex.exec(html)) !== null) {
    const tag = tagMatch[0];

    // Step 2: Check if alt text matches "ABBR icon"
    const altMatch = tag.match(/alt=["'](\w+)\s+icon["']/i);
    if (!altMatch) continue;
    const abbr = altMatch[1].toLowerCase();

    // Step 3: Extract the /_next/image URL
    const srcMatch = tag.match(/src=["'][^"']*\/_next\/image\?url=([^&"']+)/i);
    if (!srcMatch) continue;

    // Step 4: Decode the S3 URL
    let s3Url: string;
    try {
      s3Url = decodeURIComponent(srcMatch[1]);
    } catch {
      continue;
    }

    // Skip non-S3 URLs and placeholder images
    if (!s3Url.includes('polymarket-upload.s3') && !s3Url.includes('amazonaws.com')) continue;
    if (s3Url.endsWith('/a.png')) continue; // placeholder

    const key = `${leagueSlug}:${abbr}`;
    if (seen.has(key)) continue;
    seen.add(key);

    logos.push({ abbr, s3Url, league: leagueSlug });
  }

  return logos;
}

/** Extract league sub-page slugs from the sidebar on the main sports page */
function extractLeagueSlugs(html: string): string[] {
  const slugs = new Set<string>();
  // Match sidebar links: href="/sports/{slug}/games" or href="/sports/{slug}"
  const linkRegex = /href=["']\/sports\/([a-z0-9-]+)\/games["']/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const slug = match[1];
    if (slug !== 'live' && slug !== 'futures') {
      slugs.add(slug);
    }
  }
  return Array.from(slugs);
}

/** Fetch a page with timeout and error handling */
async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Build logo map supplement from scraped logos */
function buildPolymarketLogoMap(logos: ScrapedLogo[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const logo of logos) {
    const abbrUpper = logo.abbr.toUpperCase();

    // Index by league:ABBR (primary lookup key)
    map[`${logo.league}:${abbrUpper}`] = logo.s3Url;
    map[`${logo.league}:${logo.abbr}`] = logo.s3Url;

    // Cross-league fallback
    if (!map[`*:${abbrUpper}`]) map[`*:${abbrUpper}`] = logo.s3Url;
    if (!map[`*:${logo.abbr}`]) map[`*:${logo.abbr}`] = logo.s3Url;
  }

  return map;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Fetch the main sports/live page to get league list + live match logos
    console.log('[PM Logo Scrape] Fetching main sports page...');
    const mainHtml = await fetchPage('https://polymarket.com/sports/live');
    const mainLogos = extractLogos(mainHtml, 'sports');
    const leagueSlugs = extractLeagueSlugs(mainHtml);
    console.log(`[PM Logo Scrape] Main page: ${mainLogos.length} logos, ${leagueSlugs.length} leagues`);

    // 2. Fetch league sub-pages in batches of 8
    const allLogos = [...mainLogos];
    const BATCH_SIZE = 8;
    const leagueStats: Record<string, number> = {};

    for (let i = 0; i < leagueSlugs.length; i += BATCH_SIZE) {
      const batch = leagueSlugs.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (slug) => {
          const url = `https://polymarket.com/sports/${slug}/games`;
          const html = await fetchPage(url);
          const logos = extractLogos(html, slug);
          return { slug, logos };
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { slug, logos } = result.value;
          allLogos.push(...logos);
          leagueStats[slug] = logos.length;
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < leagueSlugs.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`[PM Logo Scrape] Total scraped: ${allLogos.length} logos from ${Object.keys(leagueStats).length + 1} pages`);

    // 3. Build the Polymarket logo map
    const pmMap = buildPolymarketLogoMap(allLogos);

    // 4. Load existing map and merge (existing ESPN/PandaScore logos take priority)
    const { rows } = await pool.query(`SELECT data FROM api_cache WHERE key = 'team_logos_map'`);
    const existingMap: Record<string, string> = rows[0]?.data || {};
    const existingCount = Object.keys(existingMap).length;

    // Polymarket logos go first (as base), then existing logos override
    const merged = { ...pmMap, ...existingMap };
    const mergedCount = Object.keys(merged).length;
    const newEntries = mergedCount - existingCount;

    // 5. Save merged map
    await pool.query(`
      INSERT INTO api_cache (key, data, updated_at)
      VALUES ('team_logos_map', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()
    `, [JSON.stringify(merged)]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PM Logo Scrape] Done in ${elapsed}s. Scraped: ${allLogos.length}, New entries: ${newEntries}, Total map: ${mergedCount}`);

    return NextResponse.json({
      success: true,
      scraped_logos: allLogos.length,
      leagues_scraped: Object.keys(leagueStats).length + 1,
      new_entries: newEntries,
      total_map_entries: mergedCount,
      elapsed_seconds: parseFloat(elapsed),
      league_breakdown: leagueStats,
    });
  } catch (err: any) {
    console.error('[PM Logo Scrape] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST also triggers scrape (for manual invocation)
export async function POST(req: NextRequest) {
  return GET(req);
}
