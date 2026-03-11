'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import MarketCard from './MarketCard';
import SeriesCard, { SeriesData } from './SeriesCard';
import { Market } from '@/lib/types';
import { getCategorySlug } from '@/lib/categories';
import { useLiveMarkets } from '@/hooks/useLivePrices';

const swrFetcher = (url: string) => fetch(url).then(r => r.json());

const PAGE_SIZE = 100;

/**
 * Fetches markets from Polymarket API directly (live) with full pagination.
 * Falls back to local DB if live fails.
 */
export default function CategoryGrid({ category, subtag, tag, initialMarkets }: { category: string; subtag?: string; tag?: string; initialMarkets?: Market[] }) {
  const slug = tag || getCategorySlug(category);
  const tagParam = subtag || slug;
  const [extraMarkets, setExtraMarkets] = useState<Market[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(PAGE_SIZE);

  // Primary: fetch from Polymarket live API
  const { data: liveMarkets, error: liveError, isLoading: liveLoading } = useSWR<Market[]>(
    `/api/polymarket/events/live?tag=${encodeURIComponent(tagParam)}&limit=${PAGE_SIZE}&offset=0`,
    swrFetcher,
    { refreshInterval: 30000, fallbackData: initialMarkets && initialMarkets.length > 0 ? initialMarkets : undefined }
  );

  // Fallback: DB-backed endpoint (used if live returns empty or errors)
  const useFallback = liveError || (liveMarkets && liveMarkets.length === 0);
  const { data: dbMarkets = [] } = useSWR<Market[]>(
    useFallback ? `/api/polymarket/events?limit=100&order=volume24hr&tag=${encodeURIComponent(tagParam)}` : null,
    swrFetcher,
    { refreshInterval: 30000 }
  );

  const { data: series = [] } = useSWR<SeriesData[]>(
    !subtag ? `/api/polymarket/series?tag=${encodeURIComponent(slug)}&limit=10` : null,
    swrFetcher,
    { refreshInterval: 30000, revalidateOnFocus: false }
  );

  const rawMarkets = [...(liveMarkets || dbMarkets), ...extraMarkets];

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = rawMarkets.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  const allMarkets = useLiveMarkets(deduped);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/polymarket/events/live?tag=${encodeURIComponent(tagParam)}&limit=${PAGE_SIZE}&offset=${offset}`
      );
      const more: Market[] = await res.json();
      if (more.length < PAGE_SIZE) setHasMore(false);
      if (more.length === 0) { setHasMore(false); return; }
      setExtraMarkets(prev => [...prev, ...more]);
      setOffset(prev => prev + PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [tagParam, offset]);

  const isLoading = liveLoading && allMarkets.length === 0;

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
        ))}
      </div>
    );
  }

  if (allMarkets.length === 0 && series.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        No markets found in {category}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-4">
        {series.map((s) => (
          <SeriesCard key={s.seriesSlug} series={s} />
        ))}
        {allMarkets.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
      {hasMore && (liveMarkets?.length ?? 0) >= PAGE_SIZE && (
        <div className="flex justify-center pb-8">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-[8px] px-6 py-2.5 text-[13px] font-medium transition-all hover:opacity-80 disabled:opacity-40"
            style={{
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {loadingMore ? 'Loading...' : 'Load More Markets'}
          </button>
        </div>
      )}
    </>
  );
}
