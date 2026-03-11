'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import Link from 'next/link';

interface Profile {
  id: string;
  address: string;
  username: string | null;
  created_at: string;
  markets_traded: number;
  total_volume: number;
  win_rate: number;
}

function formatUsd(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

export default function ProfilePage() {
  const params = useParams();
  const address = params.address as string;

  const { data: profile, isLoading } = useSWR<Profile>(
    address ? `/api/users/${address}/profile` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-20 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-20 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
        User not found
      </div>
    );
  }

  const displayName = profile.username || `${profile.address.slice(0, 6)}...${profile.address.slice(-4)}`;

  return (
    <div className="mx-auto max-w-[900px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      {/* Profile card */}
      <div className="rounded-[16px]" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '24px' }}>
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-[18px] font-bold"
            style={{ background: 'rgba(20, 82, 240, 0.1)', color: 'var(--brand-blue)' }}
          >
            {(profile.username || profile.address.slice(2, 4)).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {displayName}
            </h1>
            <p className="text-[12px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>{profile.address}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="rounded-[10px]" style={{ padding: '14px', background: 'var(--bg-surface)' }}>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Markets Traded</div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{profile.markets_traded}</div>
          </div>
          <div className="rounded-[10px]" style={{ padding: '14px', background: 'var(--bg-surface)' }}>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Volume</div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {formatUsd(profile.total_volume)}
            </div>
          </div>
          <div className="rounded-[10px]" style={{ padding: '14px', background: 'var(--bg-surface)' }}>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Win Rate</div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: 'var(--yes-green)' }}>{profile.win_rate}%</div>
          </div>
          <div className="rounded-[10px]" style={{ padding: '14px', background: 'var(--bg-surface)' }}>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Joined</div>
            <div className="text-[16px] font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
              {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex gap-3">
        <Link
          href={`/activity`}
          className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-colors"
          style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          View Activity
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-colors"
          style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
