'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { Trade } from '@/lib/types';

interface Props {
  marketId: string;
}

export default function TradeHistory({ marketId }: Props) {
  const { data } = useSWR<{ trades: Trade[] }>(
    `/api/trades?market_id=${marketId}&limit=20`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const trades = data?.trades || [];

  return (
    <div className="rounded-[12px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Recent Trades</h3>
      {trades.length === 0 ? (
        <div className="py-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>No trades yet</div>
      ) : (
        <div className="text-[12px]">
          <div className="flex justify-between font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
            <span>Price</span>
            <span>Size</span>
            <span>Time</span>
          </div>
          {trades.map((t) => (
            <div key={t.id} className="flex justify-between py-[3px]">
              <span className="font-medium" style={{ color: t.side === 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
                {Number(t.price).toFixed(2)}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{Number(t.size).toFixed(0)}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
