'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useSWRInfinite from 'swr/infinite';
import { fetcher } from '@/lib/api';
import { Market } from '@/lib/types';
import MarketCard from '@/components/market/MarketCard';
import Link from 'next/link';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { key: 'volume', label: 'Volume' },
  { key: 'new', label: 'Newest' },
  { key: 'closing', label: 'Closing Soon' },
];

interface MarketsResponse {
  markets: Market[];
  total: number;
  limit: number;
  offset: number;
}

export default function MarketsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('volume');
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const getKey = (pageIndex: number, previousPageData: MarketsResponse | null) => {
    if (previousPageData && previousPageData.markets.length === 0) return null;
    const offset = pageIndex * PAGE_SIZE;
    const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
    return `/api/markets?limit=${PAGE_SIZE}&offset=${offset}${searchParam}&sort=${sort}`;
  };

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<MarketsResponse>(
    getKey,
    fetcher,
    { refreshInterval: 10000 }
  );

  const markets = data ? data.flatMap((page) => page.markets) : [];
  const total = data?.[0]?.total || 0;
  const hasMore = markets.length < total;

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !isValidating) {
        setSize((s) => s + 1);
      }
    },
    [hasMore, isValidating, setSize]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  return (
    <div className="mx-auto max-w-[1400px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
        <h1 className="text-[24px] font-bold" style={{ color: 'var(--text-primary)' }}>Browse Markets</h1>
        <Link
          href="/markets/create"
          className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-white transition-colors"
          style={{ background: 'var(--brand-blue)' }}
        >
          + Create Market
        </Link>
      </div>

      {/* Search */}
      <div className="relative" style={{ marginBottom: '16px' }}>
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search markets..."
          className="w-full rounded-[10px] pl-10 pr-4 py-2.5 text-[14px] focus:outline-none transition-colors"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Sort pills */}
      <div className="flex items-center gap-1.5" style={{ marginBottom: '20px' }}>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            className="rounded-full px-3.5 py-[6px] text-[12px] font-medium transition-all"
            style={{
              background: sort === opt.key ? 'var(--text-primary)' : 'var(--bg-surface)',
              color: sort === opt.key ? 'var(--bg)' : 'var(--text-secondary)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : markets.length === 0 ? (
        <div className="py-20 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>No markets found</div>
      ) : (
        <>
          <p className="text-[12px] mb-4" style={{ color: 'var(--text-muted)' }}>{total} markets</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        </>
      )}

      <div ref={loaderRef} className="py-8 text-center">
        {isValidating && size > 1 && (
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading more...</span>
        )}
      </div>
    </div>
  );
}
