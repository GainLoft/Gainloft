'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';

interface LeaderboardEntry {
  user_id: string;
  address: string;
  username: string | null;
  total_pnl: number;
  volume: number;
  markets_traded: number;
  rank: number;
}

const PERIODS = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'all', label: 'All Time' },
] as const;

function formatUsd(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

// Dummy data for display when API is not connected
const DUMMY_LEADERS: LeaderboardEntry[] = Array.from({ length: 20 }, (_, i) => ({
  user_id: `u${i}`,
  address: `0x${(i + 1).toString(16).padStart(4, '0')}${'a'.repeat(36)}`,
  username: i < 5 ? ['CryptoKing', 'ASEANWhale', 'PredictorX', 'SiamTrader', 'ManilaBull'][i] : null,
  total_pnl: Math.round((20 - i) * 1500 * (1 + Math.random()) * 100) / 100,
  volume: Math.round((20 - i) * 8000 * (1 + Math.random())),
  markets_traded: Math.round(50 - i * 2 + Math.random() * 10),
  rank: i + 1,
}));

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<string>('all');

  const { data } = useSWR<{ leaders: LeaderboardEntry[] }>(
    `/api/leaderboard?period=${period}&limit=100`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const leaders = data?.leaders || DUMMY_LEADERS;

  return (
    <div className="mx-auto max-w-[1000px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="text-[24px] font-bold" style={{ color: 'var(--text-primary)' }}>Leaderboard</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            Top traders ranked by profit &amp; loss
          </p>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex items-center gap-1 mb-5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className="rounded-full px-4 py-[6px] text-[13px] font-medium transition-all"
            style={{
              background: period === p.key ? 'var(--text-primary)' : 'var(--bg-surface)',
              color: period === p.key ? 'var(--bg)' : 'var(--text-secondary)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Top 3 cards */}
      {leaders.length >= 3 && (
        <div className="grid grid-cols-3 gap-3" style={{ marginBottom: '24px' }}>
          {leaders.slice(0, 3).map((entry, i) => {
            const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];
            return (
              <div
                key={entry.user_id}
                className="rounded-[12px] text-center"
                style={{ padding: '20px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <div
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[16px] font-bold"
                  style={{ background: medals[i] + '22', color: medals[i], marginBottom: '8px' }}
                >
                  {i + 1}
                </div>
                <Link
                  href={`/profile/${entry.address}`}
                  className="text-[14px] font-semibold block truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {entry.username || `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`}
                </Link>
                <div
                  className="text-[20px] font-bold tabular-nums mt-1"
                  style={{ color: entry.total_pnl >= 0 ? 'var(--yes-green)' : 'var(--no-red)' }}
                >
                  {entry.total_pnl >= 0 ? '+' : ''}{formatUsd(entry.total_pnl)}
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {formatUsd(entry.volume)} volume &middot; {entry.markets_traded} markets
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)', width: '50px' }}>#</th>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Trader</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>Profit / Loss</th>
              <th className="text-right px-4 py-3 font-medium hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Volume</th>
              <th className="text-right px-4 py-3 font-medium hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Markets</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((entry, i) => (
              <tr key={entry.user_id} style={{ borderBottom: i < leaders.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{entry.rank || i + 1}</td>
                <td className="px-4 py-3">
                  <Link href={`/profile/${entry.address}`} className="flex items-center gap-2.5">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
                      style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
                    >
                      {(entry.username || entry.address.slice(2, 4)).slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {entry.username || `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold tabular-nums" style={{ color: entry.total_pnl >= 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
                    {entry.total_pnl >= 0 ? '+' : ''}{formatUsd(entry.total_pnl)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                  {formatUsd(entry.volume)}
                </td>
                <td className="px-4 py-3 text-right hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>
                  {entry.markets_traded}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
