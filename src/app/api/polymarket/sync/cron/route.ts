import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min max for long syncs

/**
 * GET /api/polymarket/sync/cron
 *
 * Automated sync of all sports categories from Polymarket.
 * Designed to be called every 10 minutes by a cron job or setInterval.
 *
 * Query params:
 *   secret  — must match CRON_SECRET env var (optional security)
 *   mode    — "full" (all sports, more pages) or "quick" (top sports, fewer pages). Default: "quick"
 *
 * Quick mode (~2 min): syncs top 5 pages of each major sport + 2 pages of smaller ones
 * Full mode (~10 min): syncs 20+ pages of each sport for deep coverage
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// All sport tags to sync, with page limits for quick vs full mode
const SPORT_TAGS: { tag: string; quickPages: number; fullPages: number }[] = [
  // Major sports (high volume)
  { tag: 'soccer', quickPages: 5, fullPages: 80 },
  { tag: 'basketball', quickPages: 5, fullPages: 80 },
  { tag: 'esports', quickPages: 5, fullPages: 80 },
  { tag: 'hockey', quickPages: 5, fullPages: 30 },
  { tag: 'tennis', quickPages: 5, fullPages: 50 },
  { tag: 'cricket', quickPages: 5, fullPages: 50 },

  // Medium sports
  { tag: 'rugby', quickPages: 2, fullPages: 15 },
  { tag: 'ufc', quickPages: 2, fullPages: 30 },
  { tag: 'baseball', quickPages: 2, fullPages: 30 },
  { tag: 'football', quickPages: 2, fullPages: 30 },
  { tag: 'table-tennis', quickPages: 2, fullPages: 15 },
  { tag: 'golf', quickPages: 2, fullPages: 30 },
  { tag: 'f1', quickPages: 2, fullPages: 30 },
  { tag: 'boxing', quickPages: 2, fullPages: 15 },
  { tag: 'chess', quickPages: 2, fullPages: 30 },
  { tag: 'pickleball', quickPages: 2, fullPages: 10 },
  { tag: 'lacrosse', quickPages: 2, fullPages: 10 },

  // Key sub-leagues (ensure coverage)
  { tag: 'nba', quickPages: 3, fullPages: 10 },
  { tag: 'nhl', quickPages: 3, fullPages: 10 },
  { tag: 'epl', quickPages: 3, fullPages: 10 },
  { tag: 'ucl', quickPages: 3, fullPages: 10 },
  { tag: 'nfl', quickPages: 2, fullPages: 10 },
  { tag: 'mlb', quickPages: 2, fullPages: 10 },
  { tag: 'counter-strike-2', quickPages: 3, fullPages: 10 },
  { tag: 'valorant', quickPages: 3, fullPages: 10 },
  { tag: 'league-of-legends', quickPages: 3, fullPages: 10 },
  { tag: 'dota-2', quickPages: 3, fullPages: 10 },
  { tag: 'ipl', quickPages: 2, fullPages: 20 },
  { tag: 'cfb', quickPages: 2, fullPages: 10 },
  { tag: 'ncaa-basketball', quickPages: 2, fullPages: 10 },

  // Soccer leagues
  { tag: 'la-liga', quickPages: 2, fullPages: 10 },
  { tag: 'serie-a', quickPages: 2, fullPages: 5 },
  { tag: 'bundesliga', quickPages: 2, fullPages: 5 },
  { tag: 'ligue-1', quickPages: 2, fullPages: 5 },
  { tag: 'mls', quickPages: 2, fullPages: 5 },

  // Esports extras
  { tag: 'honor-of-kings', quickPages: 2, fullPages: 10 },
  { tag: 'call-of-duty', quickPages: 2, fullPages: 10 },
  { tag: 'rainbow-six-siege', quickPages: 2, fullPages: 10 },
  { tag: 'rocket-league', quickPages: 2, fullPages: 10 },
  { tag: 'overwatch', quickPages: 2, fullPages: 5 },

  // Hockey/Basketball leagues
  { tag: 'euroleague-basketball', quickPages: 2, fullPages: 10 },
  { tag: 'cba', quickPages: 2, fullPages: 10 },
  { tag: 'kbo', quickPages: 2, fullPages: 10 },

  // Rugby leagues
  { tag: 'super-rugby-pacific', quickPages: 2, fullPages: 10 },
  { tag: 'rugby-champions-cup', quickPages: 2, fullPages: 10 },

  // Cricket leagues
  { tag: 'international-cricket', quickPages: 2, fullPages: 10 },
];

export async function GET(req: NextRequest) {
  // Optional secret check
  const secret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get('mode') === 'full' ? 'full' : 'quick';
  const startTime = Date.now();
  const results: { tag: string; synced: number; skipped: number; pages: number }[] = [];
  let totalSynced = 0;
  let totalSkipped = 0;

  for (const { tag, quickPages, fullPages } of SPORT_TAGS) {
    const maxPages = mode === 'full' ? fullPages : quickPages;
    try {
      const res = await fetch(`${BASE_URL}/api/polymarket/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, maxPages }),
      });
      const data = await res.json();
      results.push({ tag, synced: data.synced || 0, skipped: data.skipped || 0, pages: data.pages || 0 });
      totalSynced += data.synced || 0;
      totalSkipped += data.skipped || 0;
    } catch (err) {
      results.push({ tag, synced: 0, skipped: 0, pages: 0 });
      console.error(`Cron sync error for ${tag}:`, err);
    }
  }

  // Resolution sync: mark closed/resolved markets in DB
  let totalResolved = 0;
  try {
    const resRes = await fetch(`${BASE_URL}/api/polymarket/sync`, { method: 'PUT' });
    const resData = await resRes.json();
    totalResolved = resData.resolved || 0;
    console.log(`[Cron Sync] Resolution pass: resolved=${totalResolved} checked=${resData.checked || 0}`);
  } catch (err) {
    console.error('[Cron Sync] Resolution pass error:', err);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`[Cron Sync] mode=${mode} synced=${totalSynced} skipped=${totalSkipped} resolved=${totalResolved} duration=${duration}s`);

  return NextResponse.json({
    mode,
    totalSynced,
    totalSkipped,
    totalResolved,
    tags: results.length,
    duration: `${duration}s`,
    results,
  });
}
