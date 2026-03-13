'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import MarketCard from './MarketCard';
import { Market } from '@/lib/types';
import { useLiveMarkets } from '@/hooks/useLivePrices';

const swrFetcher = (url: string) => fetch(url).then(r => r.json());
const PAGE_SIZE = 30;

// Well-known labels for slugs
const SLUG_LABELS: Record<string, string> = {
  '5m': '5 Min', '15m': '15 Min', '4hour': '4 Hour',
  'pre-market': 'Pre-Market', etf: 'ETF', ai: 'AI',
  xrp: 'XRP', bnb: 'BNB', ath: 'ATH',
  microstrategy: 'MicroStrategy', hyperliquid: 'Hyperliquid',
};

function slugToLabel(slug: string): string {
  if (SLUG_LABELS[slug]) return SLUG_LABELS[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const TIME_SUBCATEGORIES = new Set(['5m', '15m', 'hourly', '4hour']);

export default function SubcategoryPage({ parentCategory, parentLabel, parentTag }: { parentCategory: string; parentLabel: string; parentTag?: string }) {
  const params = useParams();
  const sub = params.sub as string;
  const subLabel = slugToLabel(sub);
  const isTimeSub = TIME_SUBCATEGORIES.has(sub);
  const effectiveTag = parentTag || parentCategory;

  // Infinite scroll state
  const [extraMarkets, setExtraMarkets] = useState<Market[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Primary: fetch from Polymarket live API
  // Pass parentCategory so the API can cross-filter (e.g. "daily" + "crypto" = only crypto daily events)
  const { data: liveMarkets, error: liveError, isLoading: liveLoading } = useSWR<Market[]>(
    `/api/polymarket/events/live?tag=${encodeURIComponent(sub)}&parentTag=${encodeURIComponent(effectiveTag)}&limit=${PAGE_SIZE}&offset=0&active=true&closed=false`,
    swrFetcher,
    { refreshInterval: isTimeSub ? 15000 : 30000 }
  );

  // Fallback: DB-backed endpoint
  const useFallback = liveError || (liveMarkets && liveMarkets.length === 0);
  const { data: dbMarkets = [] } = useSWR<Market[]>(
    useFallback ? `/api/polymarket/events?limit=100&order=volume24hr&tag=${encodeURIComponent(sub)}` : null,
    swrFetcher,
    { refreshInterval: 30000 }
  );

  // Reset infinite scroll state when subcategory changes
  useEffect(() => {
    setExtraMarkets([]);
    setOffset(PAGE_SIZE);
    setHasMore(true);
    setLoadingMore(false);
  }, [sub, effectiveTag]);

  // When initial SWR data arrives, check if we already have fewer than PAGE_SIZE (no more to load)
  useEffect(() => {
    if (liveMarkets && liveMarkets.length < PAGE_SIZE) {
      setHasMore(false);
    }
  }, [liveMarkets]);

  // Combine SWR data with extra markets, deduplicate by id
  const rawMarkets = liveMarkets && liveMarkets.length > 0 ? liveMarkets : dbMarkets;
  const combined = [...rawMarkets, ...extraMarkets];
  const seen = new Set<string>();
  const deduped = combined.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  const markets = useLiveMarkets(deduped);
  const isLoading = liveLoading && markets.length === 0;

  // Load more function for infinite scroll
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || useFallback) return;
    setLoadingMore(true);
    try {
      const url = `/api/polymarket/events/live?tag=${encodeURIComponent(sub)}&parentTag=${encodeURIComponent(effectiveTag)}&limit=${PAGE_SIZE}&offset=${offset}&active=true&closed=false`;
      const res = await fetch(url);
      const data: Market[] = await res.json();
      if (!data || data.length === 0) {
        setHasMore(false);
      } else {
        setExtraMarkets(prev => [...prev, ...data]);
        setOffset(prev => prev + PAGE_SIZE);
        if (data.length < PAGE_SIZE) {
          setHasMore(false);
        }
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, useFallback, sub, effectiveTag, offset]);

  // IntersectionObserver for sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 className="text-[28px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        {parentLabel}: {subLabel}
      </h1>
      <p className="mb-6" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Prediction markets in {subLabel}
      </p>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          No markets found for {subLabel}
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>

          {/* Loading more skeletons */}
          {loadingMore && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
              ))}
            </div>
          )}

          {/* Sentinel for IntersectionObserver */}
          {hasMore && !useFallback && <div ref={sentinelRef} style={{ height: 1 }} />}

          {/* No more markets message */}
          {!hasMore && markets.length > 0 && (
            <div className="text-center py-8 pb-12" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No more markets
            </div>
          )}
        </>
      )}
    </div>
  );
}
