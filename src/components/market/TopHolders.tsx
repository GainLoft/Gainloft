'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import Link from 'next/link';

interface Holder {
  user_id: string;
  address: string;
  username: string | null;
  outcome: string;
  shares: number;
}

interface Props {
  marketId: string;
}

export default function TopHolders({ marketId }: Props) {
  const { data } = useSWR<{ holders: Holder[] }>(
    `/api/markets/${marketId}/holders`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const holders = data?.holders || [];

  return (
    <div className="rounded-[12px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Top Holders</h3>
      {holders.length === 0 ? (
        <div className="py-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>No holders yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {holders.map((h, i) => (
            <div key={h.user_id + h.outcome} className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2">
                <span className="w-4" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                <Link
                  href={`/profile/${h.address}`}
                  style={{ color: 'var(--text-primary)' }}
                >
                  {h.username || `${h.address.slice(0, 6)}...${h.address.slice(-4)}`}
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    background: h.outcome === 'Yes' ? 'var(--green-bg)' : 'var(--red-bg)',
                    color: h.outcome === 'Yes' ? 'var(--yes-green)' : 'var(--no-red)',
                  }}
                >
                  {h.outcome}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{h.shares.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
