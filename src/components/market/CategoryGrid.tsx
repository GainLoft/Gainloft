'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import useSWR from 'swr';
import MarketCard from './MarketCard';
import SeriesCard, { SeriesData } from './SeriesCard';
import { Market } from '@/lib/types';
import { getCategorySlug } from '@/lib/categories';
import { useLiveMarkets } from '@/hooks/useLivePrices';

const swrFetcher = (url: string) => fetch(url).then(r => r.json());

const PAGE_SIZE = 30;

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

  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = hasMore && (liveMarkets?.length ?? 0) >= PAGE_SIZE;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loadingMore, loadMore]);

  const isLoading = liveLoading && allMarkets.length === 0;

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-8">
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
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4">
        {series.map((s) => (
          <SeriesCard key={s.seriesSlug} series={s} />
        ))}
        {allMarkets.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
      {loadingMore && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`skel-${i}`} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
          ))}
        </div>
      )}
      {canLoadMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      {!canLoadMore && allMarkets.length > 0 && (
        <div className="text-center py-6" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No more markets
        </div>
      )}
    </>
  );
}
