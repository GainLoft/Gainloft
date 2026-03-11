'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DUMMY_MARKETS } from '@/lib/dummyData';
import { Market } from '@/lib/types';
import MarketCard from '@/components/market/MarketCard';

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('watchlist');
    if (saved) {
      try { setWatchlist(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const watchedMarkets: Market[] = DUMMY_MARKETS.filter((m) => watchlist.includes(m.id));

  if (!mounted) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-20 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="text-[24px] font-bold" style={{ color: 'var(--text-primary)' }}>Watchlist</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            Markets you&apos;re following
          </p>
        </div>
        <span className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {watchedMarkets.length} market{watchedMarkets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {watchedMarkets.length === 0 ? (
        <div
          className="rounded-[16px] text-center"
          style={{ padding: '48px 24px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-4" style={{ color: 'var(--text-icon)' }}>
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <h3 className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            No markets saved yet
          </h3>
          <p className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            Bookmark markets you want to track by clicking the save icon on any market card.
          </p>
          <Link
            href="/markets"
            className="inline-block rounded-[8px] px-6 py-2.5 text-[14px] font-semibold text-white transition-colors"
            style={{ background: 'var(--brand-blue)' }}
          >
            Browse Markets
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {watchedMarkets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
