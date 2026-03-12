'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MarketCard from '@/components/market/MarketCard';
import { Market } from '@/lib/types';
import { useLiveMarkets } from '@/hooks/useLivePrices';

const PAGE_SIZE = 30;

export default function NewClient({ initialMarkets = [] }: { initialMarkets?: Market[] }) {
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [offset, setOffset] = useState(initialMarkets.length);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMarkets.length >= PAGE_SIZE);
  const [initialLoaded, setInitialLoaded] = useState(initialMarkets.length > 0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Initial client-side fetch if no server data
  useEffect(() => {
    if (initialMarkets.length > 0) return;
    setLoading(true);
    fetch(`/api/polymarket/events?limit=${PAGE_SIZE}&offset=0&order=volume24hr&active=true`)
      .then(r => r.json())
      .then((data: Market[]) => {
        const arr = Array.isArray(data) ? data : [];
        setMarkets(arr);
        setOffset(arr.length);
        setHasMore(arr.length >= PAGE_SIZE);
        setInitialLoaded(true);
      })
      .catch(() => setInitialLoaded(true))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setLoading(true);
    fetch(`/api/polymarket/events?limit=${PAGE_SIZE}&offset=${offset}&order=volume24hr&active=true`)
      .then(r => r.json())
      .then((data: Market[]) => {
        const arr = Array.isArray(data) ? data : [];
        if (arr.length === 0) {
          setHasMore(false);
        } else {
          setMarkets(prev => {
            // Deduplicate by id
            const existingIds = new Set(prev.map(m => m.id));
            const newItems = arr.filter(m => !existingIds.has(m.id));
            return [...prev, ...newItems];
          });
          setOffset(prev => prev + arr.length);
          setHasMore(arr.length >= PAGE_SIZE);
        }
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  }, [loading, hasMore, offset]);

  // IntersectionObserver for infinite scroll
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

  const liveMarkets = useLiveMarkets(markets);

  return (
    <div style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 className="text-[28px] font-bold mb-1">New Markets</h1>
      <p className="mb-6" style={{ color: 'var(--text-muted)', fontSize: 14 }}>Recently created prediction markets</p>

      {!initialLoaded && markets.length === 0 ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
            {liveMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>

          {/* Sentinel for intersection observer */}
          <div ref={sentinelRef} style={{ height: 1 }} />

          {loading && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
              ))}
            </div>
          )}

          {!hasMore && markets.length > 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '16px 0' }}>
              No more markets
            </p>
          )}
        </>
      )}
    </div>
  );
}
