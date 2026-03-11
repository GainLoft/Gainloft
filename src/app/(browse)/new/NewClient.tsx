'use client';

import { useState, useRef } from 'react';
import useSWR from 'swr';
import MarketCard from '@/components/market/MarketCard';
import { Market } from '@/lib/types';
import { useLiveMarkets } from '@/hooks/useLivePrices';

declare global {
  interface Window { __NEW_PROMISE?: Promise<any>; __NEW_DATA?: any; }
}

export default function NewClient() {
  const prefetchUsed = useRef(false);

  const [initialData] = useState<Market[] | undefined>(() => {
    if (typeof window !== 'undefined' && window.__NEW_DATA) {
      const d = window.__NEW_DATA;
      window.__NEW_DATA = undefined;
      return Array.isArray(d) ? d : undefined;
    }
    return undefined;
  });

  const { data: rawMarkets = initialData || [], isLoading } = useSWR<Market[]>(
    '/api/polymarket/events?limit=100&order=newest',
    (url: string) => {
      if (!prefetchUsed.current && window.__NEW_PROMISE) {
        prefetchUsed.current = true;
        const p = window.__NEW_PROMISE;
        window.__NEW_PROMISE = undefined;
        return p;
      }
      return fetch(url).then(r => r.json());
    },
    { refreshInterval: 30000, fallbackData: initialData }
  );

  const markets = useLiveMarkets(rawMarkets);

  return (
    <div style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 className="text-[28px] font-bold mb-1">New Markets</h1>
      <p className="mb-6" style={{ color: 'var(--text-muted)', fontSize: 14 }}>Recently created prediction markets</p>
      {isLoading && markets.length === 0 ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
