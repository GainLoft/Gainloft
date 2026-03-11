'use client';

import useSWR from 'swr';
import MarketCard from '@/components/market/MarketCard';
import { Market } from '@/lib/types';
import { useLiveMarkets } from '@/hooks/useLivePrices';

const swrFetcher = (url: string) => fetch(url).then(r => r.json());

export default function NewClient({ initialMarkets = [] }: { initialMarkets?: Market[] }) {
  const { data: rawMarkets = initialMarkets, isLoading } = useSWR<Market[]>(
    '/api/polymarket/events?limit=100&order=newest',
    swrFetcher,
    { refreshInterval: 30000, fallbackData: initialMarkets.length > 0 ? initialMarkets : undefined }
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
