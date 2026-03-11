import { NextRequest, NextResponse } from 'next/server';

// Edge Runtime: ~0ms cold start (V8 isolate, not Node.js)
export const runtime = 'edge';
export const preferredRegion = 'sin1';

/** Short-lived redirect so CDNs don't cache the fallback */
function redirectToFull(req: NextRequest) {
  const fallback = new URL('/api/polymarket/sports', req.url);
  fallback.search = req.nextUrl.search;
  return new NextResponse(null, {
    status: 307,
    headers: {
      'Location': fallback.toString(),
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * GET /api/polymarket/sports-fast
 *
 * Ultra-fast edge endpoint that reads precomputed sports data
 * from Supabase REST API. Falls back to 307 redirect to the
 * full serverless endpoint if cache miss.
 */
export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return redirectToFull(req);
  }

  // Check for filters — edge only serves unfiltered default page
  const params = req.nextUrl.searchParams;
  const tab = params.get('tab') || 'live';
  const sport = params.get('sport') || '';
  const league = params.get('league') || '';
  const offset = params.get('offset') || '0';

  if (tab !== 'live' || sport || league || offset !== '0') {
    return redirectToFull(req);
  }

  try {
    // Read processed cache from Supabase REST API (PostgREST)
    const res = await fetch(
      `${supabaseUrl}/rest/v1/api_cache?key=eq.sports_processed&select=data,updated_at`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

    const rows = await res.json();
    if (rows.length === 0) throw new Error('No cache row found');

    // Check freshness (15 min)
    const updatedAt = new Date(rows[0].updated_at);
    if (Date.now() - updatedAt.getTime() > 15 * 60 * 1000) throw new Error('Stale cache');

    return NextResponse.json(rows[0].data, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'CDN-Cache-Control': 'max-age=30',
      },
    });
  } catch {
    return redirectToFull(req);
  }
}
