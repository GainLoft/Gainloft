'use client';

import { useAccount } from 'wagmi';
import useSWR, { mutate } from 'swr';
import { fetcher, api } from '@/lib/api';
import { Order } from '@/lib/types';
import { useState } from 'react';

interface Props {
  marketId: string;
}

export default function OrderHistory({ marketId }: Props) {
  const { address, isConnected } = useAccount();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data, isLoading } = useSWR<{ orders: Order[] }>(
    isConnected && address
      ? `/api/orders?market_id=${marketId}&user_id=${address}`
      : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const orders = data?.orders || [];

  async function handleCancel(orderId: string) {
    setCancellingId(orderId);
    try {
      await api.del(`/api/orders/${orderId}`);
      mutate((key: string) => typeof key === 'string' && key.includes('/api/orders'));
    } catch (err) {
      console.error('Cancel order failed:', err);
    } finally {
      setCancellingId(null);
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-[12px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>My Orders</h3>
        <div className="py-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Connect wallet to view orders
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[12px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>My Orders</h3>
      {isLoading ? (
        <div className="py-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : orders.length === 0 ? (
        <div className="py-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>No orders yet</div>
      ) : (
        <div className="overflow-x-auto text-[12px]">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="pb-2 pr-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Side</th>
                <th className="pb-2 pr-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Price</th>
                <th className="pb-2 pr-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Size</th>
                <th className="pb-2 pr-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Filled</th>
                <th className="pb-2 pr-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="pb-2 pr-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Time</th>
                <th className="pb-2 font-medium" style={{ color: 'var(--text-muted)' }}></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-2 pr-3">
                    <span className="font-medium" style={{ color: o.side === 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
                      {o.side === 0 ? 'Buy' : 'Sell'}
                    </span>
                  </td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-primary)' }}>{Number(o.price).toFixed(2)}</td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-primary)' }}>{Number(o.size).toFixed(0)}</td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-primary)' }}>{Number(o.size_matched).toFixed(0)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: o.status === 'LIVE'
                          ? 'rgba(20, 82, 240, 0.1)' : o.status === 'FILLED'
                          ? 'var(--green-bg)' : 'var(--bg-surface)',
                        color: o.status === 'LIVE'
                          ? 'var(--brand-blue)' : o.status === 'FILLED'
                          ? 'var(--yes-green)' : 'var(--text-secondary)',
                      }}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>
                    {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2">
                    {o.status === 'LIVE' && (
                      <button
                        onClick={() => handleCancel(o.id)}
                        disabled={cancellingId === o.id}
                        className="text-[11px] font-medium disabled:opacity-40"
                        style={{ color: 'var(--no-red)' }}
                      >
                        {cancellingId === o.id ? '...' : 'Cancel'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
