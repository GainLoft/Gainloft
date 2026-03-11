import { NextResponse } from 'next/server';
import { pmTagToLocalSlug } from '@/lib/categories';

/**
 * Returns the ordered list of Polymarket categories.
 * Scraped dynamically from Polymarket's __NEXT_DATA__ filteredTags query.
 * Auto-syncs when Polymarket adds or removes categories.
 */

interface CategoryItem {
  slug: string;       // Our local URL slug (e.g., "culture")
  label: string;      // Display label (e.g., "Culture")
  pmTag: string;      // Polymarket tag slug (e.g., "pop-culture")
  pmPath: string;     // Polymarket URL path (e.g., "/pop-culture")
}

// Only needed for PM categories with non-standard URL paths
const PM_PATH_OVERRIDES: Record<string, string> = {
  sports: '/sports/live',
};

// In-memory cache
let cache: { items: CategoryItem[]; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface FilteredTag {
  slug: string;
  label: string;
}

async function fetchCategories(): Promise<CategoryItem[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return cache.items;
  }

  // Fetch a Polymarket category page to get filteredTags + nav order
  const res = await fetch('https://polymarket.com/politics', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    cache: 'no-store',
  });
  if (!res.ok) return cache?.items || [];
  const html = await res.text();

  // Extract filteredTags from __NEXT_DATA__
  // filteredTags is an array of {slug, label} objects
  let tags: FilteredTag[] = [];
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (match) {
    try {
      const nextData = JSON.parse(match[1]);
      const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
      for (const q of queries) {
        const key = Array.isArray(q.queryKey) ? q.queryKey : [];
        if (key.includes('filteredTags')) {
          const data = q?.state?.data;
          if (Array.isArray(data)) {
            tags = data.filter((t: FilteredTag) => t.slug && t.slug !== 'all');
            break;
          }
        }
      }
    } catch { /* ignore */ }
  }

  if (tags.length === 0) {
    return cache?.items || [];
  }

  // Use filteredTags order directly — it matches Polymarket's sidebar display order
  const items: CategoryItem[] = tags.map(({ slug: pmTag, label }) => {
    const localSlug = pmTagToLocalSlug(pmTag);
    return {
      slug: localSlug,
      label,
      pmTag,
      pmPath: PM_PATH_OVERRIDES[pmTag] || `/${pmTag}`,
    };
  });

  cache = { items, ts: Date.now() };
  return items;
}

export async function GET() {
  try {
    const items = await fetchCategories();
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('Categories fetch error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
