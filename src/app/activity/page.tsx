'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';

interface ActivityTrade {
  id: string;
  market_id: string;
  token_id: string;
  price: number;
  size: number;
  side: 0 | 1;
  created_at: string;
  question?: string;
  slug?: string;
  outcome?: string;
  maker_address?: string;
  taker_address?: string;
}

const FILTERS = ['All', 'Buy', 'Sell'] as const;

// Dummy activity for display
const DUMMY_ACTIVITY: ActivityTrade[] = [
  { id: '1', market_id: 'm1', token_id: 'y1', price: 0.42, size: 500, side: 0, created_at: new Date(Date.now() - 120000).toISOString(), question: 'Will Bitcoin exceed $200,000 by end of 2026?', slug: 'btc-200k-2026', outcome: 'Yes', maker_address: '0x1234abcd' },
  { id: '2', market_id: 'm5', token_id: 'n5', price: 0.65, size: 200, side: 1, created_at: new Date(Date.now() - 300000).toISOString(), question: 'Will Bongbong Marcos win the 2028 Philippine presidential election?', slug: 'philippines-election-marcos', outcome: 'No', maker_address: '0x5678efab' },
  { id: '3', market_id: 'm9', token_id: 'y9', price: 0.55, size: 1000, side: 0, created_at: new Date(Date.now() - 600000).toISOString(), question: 'Will GPT-5 be released before July 2026?', slug: 'gpt5-release-2026', outcome: 'Yes', maker_address: '0x9abcdef0' },
  { id: '4', market_id: 'm7', token_id: 'y7', price: 0.31, size: 300, side: 0, created_at: new Date(Date.now() - 900000).toISOString(), question: 'Will Ethereum reach $10,000 before 2027?', slug: 'eth-10k-2026', outcome: 'Yes', maker_address: '0xdeadbeef' },
  { id: '5', market_id: 'm10', token_id: 'n10', price: 0.18, size: 800, side: 1, created_at: new Date(Date.now() - 1200000).toISOString(), question: 'Will PAP win Singapore general election 2025 with >60% vote share?', slug: 'pap-ge-2025-60pct', outcome: 'No', maker_address: '0xcafebabe' },
  { id: '6', market_id: 'm15', token_id: 'y15', price: 0.65, size: 1500, side: 0, created_at: new Date(Date.now() - 1800000).toISOString(), question: 'Will the Fed cut rates below 4% by end of 2026?', slug: 'fed-rate-cut-2026', outcome: 'Yes', maker_address: '0x1111aaaa' },
  { id: '7', market_id: 'm2', token_id: 'y2', price: 0.28, size: 600, side: 0, created_at: new Date(Date.now() - 2400000).toISOString(), question: 'Will Real Madrid win the 2026 Champions League?', slug: 'real-madrid-ucl-2026', outcome: 'Yes', maker_address: '0x2222bbbb' },
  { id: '8', market_id: 'm6', token_id: 'y6', price: 0.73, size: 250, side: 1, created_at: new Date(Date.now() - 3600000).toISOString(), question: 'Will Thailand re-criminalize recreational cannabis by end of 2026?', slug: 'thailand-cannabis-criminalize', outcome: 'Yes', maker_address: '0x3333cccc' },
];

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');

  const { data } = useSWR<{ trades: ActivityTrade[] }>(
    '/api/trades?limit=50',
    fetcher,
    { refreshInterval: 5000 }
  );

  const allTrades = data?.trades || DUMMY_ACTIVITY;
  const trades = filter === 'All'
    ? allTrades
    : allTrades.filter((t) => (filter === 'Buy' ? t.side === 0 : t.side === 1));

  return (
    <div className="mx-auto max-w-[900px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="text-[24px] font-bold" style={{ color: 'var(--text-primary)' }}>Activity</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            Real-time trades across all markets
          </p>
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-full px-3 py-[5px] text-[12px] font-medium transition-all"
              style={{
                background: filter === f ? 'var(--text-primary)' : 'var(--bg-surface)',
                color: filter === f ? 'var(--bg)' : 'var(--text-secondary)',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 mb-4">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--yes-green)', animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite' }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--yes-green)' }} />
        </span>
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>Live</span>
      </div>

      {/* Activity list */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        {trades.length === 0 ? (
          <div className="py-16 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
            No activity yet
          </div>
        ) : (
          <div>
            {trades.map((trade, i) => (
              <div
                key={trade.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors"
                style={{ borderBottom: i < trades.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                {/* Side indicator */}
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 text-[11px] font-bold"
                  style={{
                    background: trade.side === 0 ? 'var(--green-bg)' : 'var(--red-bg)',
                    color: trade.side === 0 ? 'var(--yes-green)' : 'var(--no-red)',
                  }}
                >
                  {trade.side === 0 ? 'B' : 'S'}
                </div>

                {/* Trade info */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/event/${trade.slug || trade.market_id}`}
                    className="text-[13px] font-medium leading-tight line-clamp-1 hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {trade.question || 'Unknown market'}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: trade.side === 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
                      {trade.side === 0 ? 'Bought' : 'Sold'} {trade.outcome || 'Yes'}
                    </span>
                    <span>&middot;</span>
                    <span>{Number(trade.size).toFixed(0)} shares @ {(Number(trade.price) * 100).toFixed(0)}&cent;</span>
                  </div>
                </div>

                {/* Amount + time */}
                <div className="text-right flex-shrink-0">
                  <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    ${(Number(trade.price) * Number(trade.size)).toFixed(2)}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(trade.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
