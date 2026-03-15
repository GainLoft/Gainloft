import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/polymarket/logos/scrape
 *
 * Scrapes team logos from ESPN (traditional sports) and PandaScore (esports).
 * Builds an in-memory lookup map cached in api_cache for fast logo resolution.
 * Run weekly via cron or manually.
 */

// ESPN league configs: tag → ESPN API path
const ESPN_LEAGUES: { tag: string; sport: string; league: string; label: string }[] = [
  { tag: 'nba', sport: 'basketball', league: 'nba', label: 'NBA' },
  { tag: 'nhl', sport: 'hockey', league: 'nhl', label: 'NHL' },
  { tag: 'mlb', sport: 'baseball', league: 'mlb', label: 'MLB' },
  { tag: 'nfl', sport: 'football', league: 'nfl', label: 'NFL' },
  { tag: 'wnba', sport: 'basketball', league: 'wnba', label: 'WNBA' },
  { tag: 'ncaa-basketball', sport: 'basketball', league: 'mens-college-basketball', label: 'NCAAB' },
  { tag: 'cbb', sport: 'basketball', league: 'mens-college-basketball', label: 'NCAAB' },
  { tag: 'ncaa', sport: 'basketball', league: 'mens-college-basketball', label: 'NCAAB' },
  { tag: 'cfb', sport: 'football', league: 'college-football', label: 'CFB' },
  { tag: 'epl', sport: 'soccer', league: 'eng.1', label: 'EPL' },
  { tag: 'premier-league', sport: 'soccer', league: 'eng.1', label: 'EPL' },
  { tag: 'la-liga', sport: 'soccer', league: 'esp.1', label: 'La Liga' },
  { tag: 'serie-a', sport: 'soccer', league: 'ita.1', label: 'Serie A' },
  { tag: 'bundesliga', sport: 'soccer', league: 'ger.1', label: 'Bundesliga' },
  { tag: 'ligue-1', sport: 'soccer', league: 'fra.1', label: 'Ligue 1' },
  { tag: 'mex', sport: 'soccer', league: 'mex.1', label: 'Liga MX' },
  { tag: 'liga-mx', sport: 'soccer', league: 'mex.1', label: 'Liga MX' },
  { tag: 'mls', sport: 'soccer', league: 'usa.1', label: 'MLS' },
  { tag: 'ucl', sport: 'soccer', league: 'uefa.champions', label: 'UCL' },
  { tag: 'uel', sport: 'soccer', league: 'uefa.europa', label: 'UEL' },
  { tag: 'arg', sport: 'soccer', league: 'arg.1', label: 'Argentina Primera' },
  { tag: 'brazil-serie-a', sport: 'soccer', league: 'bra.1', label: 'Brazil Serie A' },
  { tag: 'ere', sport: 'soccer', league: 'ned.1', label: 'Eredivisie' },
  { tag: 'rus', sport: 'soccer', league: 'rus.1', label: 'Russian Premier League' },
  { tag: 'tur', sport: 'soccer', league: 'tur.1', label: 'Süper Lig' },
  { tag: 'japan-j2-league', sport: 'soccer', league: 'jpn.2', label: 'J2 League' },
  { tag: 'efl-championship', sport: 'soccer', league: 'eng.2', label: 'EFL Championship' },
  { tag: 'serie-b', sport: 'soccer', league: 'ita.2', label: 'Serie B' },
  { tag: 'bundesliga-2', sport: 'soccer', league: 'ger.2', label: '2. Bundesliga' },
  { tag: 'ligue-2', sport: 'soccer', league: 'fra.2', label: 'Ligue 2' },
  { tag: 'chinese-super-league', sport: 'soccer', league: 'chn.1', label: 'CSL' },
  { tag: 'saudi-pro-league', sport: 'soccer', league: 'sau.1', label: 'Saudi Pro League' },
  { tag: 'international-cricket', sport: 'cricket', league: 'icc-cricket-world-cup', label: 'Cricket' },
  { tag: 'ipl', sport: 'cricket', league: 'ipl', label: 'IPL' },
];

// PandaScore game configs
const PANDASCORE_GAMES = [
  { tag: 'counter-strike-2', videogame: 'csgo', label: 'Counter-Strike 2' },
  { tag: 'dota-2', videogame: 'dota2', label: 'Dota 2' },
  { tag: 'league-of-legends', videogame: 'lol', label: 'League of Legends' },
  { tag: 'valorant', videogame: 'valorant', label: 'Valorant' },
  { tag: 'rainbow-six-siege', videogame: 'r6siege', label: 'Rainbow Six Siege' },
  { tag: 'call-of-duty', videogame: 'codmw', label: 'Call of Duty' },
  { tag: 'honor-of-kings', videogame: 'kog', label: 'Honor of Kings' },
  { tag: 'overwatch', videogame: 'ow', label: 'Overwatch' },
];

interface TeamEntry {
  name: string;
  abbr: string;
  short_name: string;
  logo_url: string;
  league: string;
  source: string;
}

async function scrapeESPN(): Promise<TeamEntry[]> {
  const teams: TeamEntry[] = [];
  const seen = new Set<string>(); // dedupe by league+sport combo

  for (const cfg of ESPN_LEAGUES) {
    const dedupeKey = `${cfg.sport}/${cfg.league}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.league}/teams?limit=500`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const teamList = data?.sports?.[0]?.leagues?.[0]?.teams || [];

      for (const entry of teamList) {
        const t = entry.team || entry;
        const logos = t.logos || [];
        const logoUrl = logos.find((l: any) => l.href?.includes('-dark'))?.href || logos[0]?.href || '';
        if (!logoUrl) continue;

        teams.push({
          name: t.displayName || t.name || '',
          abbr: (t.abbreviation || '').toUpperCase(),
          short_name: t.shortDisplayName || t.nickname || '',
          logo_url: logoUrl,
          league: cfg.label,
          source: 'espn',
        });
      }
    } catch {
      console.error(`ESPN scrape failed for ${cfg.label}`);
    }
  }

  return teams;
}

async function scrapePandaScore(): Promise<TeamEntry[]> {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) {
    console.log('No PANDASCORE_API_KEY, skipping esports logos');
    return [];
  }

  const teams: TeamEntry[] = [];

  for (const cfg of PANDASCORE_GAMES) {
    try {
      // Fetch top 200 teams per game (covers active competitive teams)
      for (let page = 1; page <= 2; page++) {
        const url = `https://api.pandascore.co/${cfg.videogame}/teams?per_page=100&page=${page}&sort=-modified_at`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) break;

        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;

        for (const t of data) {
          if (!t.image_url) continue;
          teams.push({
            name: t.name || '',
            abbr: (t.acronym || '').toUpperCase(),
            short_name: t.name || '',
            logo_url: t.image_url,
            league: cfg.label,
            source: 'pandascore',
          });
        }
      }
    } catch {
      console.error(`PandaScore scrape failed for ${cfg.label}`);
    }
  }

  return teams;
}

function buildLogoMap(teams: TeamEntry[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const t of teams) {
    const league = t.league;
    // Index by multiple keys for flexible matching
    if (t.abbr) map[`${league}:${t.abbr}`] = t.logo_url;
    if (t.name) map[`${league}:${t.name.toLowerCase()}`] = t.logo_url;
    if (t.short_name) map[`${league}:${t.short_name.toLowerCase()}`] = t.logo_url;
    // Also index by just abbreviation (cross-league fallback)
    if (t.abbr) map[`*:${t.abbr}`] = t.logo_url;
  }

  return map;
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Ensure api_cache table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_cache (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Scrape in parallel
    const [espnTeams, pandaTeams] = await Promise.all([
      scrapeESPN(),
      scrapePandaScore(),
    ]);

    const allTeams = [...espnTeams, ...pandaTeams];
    const logoMap = buildLogoMap(allTeams);

    // Cache the logo map for fast lookup
    await pool.query(`
      INSERT INTO api_cache (key, data, updated_at)
      VALUES ('team_logos_map', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = NOW()
    `, [JSON.stringify(logoMap)]);

    return NextResponse.json({
      success: true,
      espn: espnTeams.length,
      pandascore: pandaTeams.length,
      total_map_entries: Object.keys(logoMap).length,
    });
  } catch (err: any) {
    console.error('Logo scrape error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Also support GET for manual trigger / cron
export async function GET(req: NextRequest) {
  return POST(req);
}
