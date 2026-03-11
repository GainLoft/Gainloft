'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { Position, Trade } from '@/lib/types';
import Link from 'next/link';

interface TradeWithMarket extends Trade {
  question?: string;
  slug?: string;
  maker_id?: string;
  taker_id?: string;
}

function formatUsd(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<'positions' | 'trades'>('positions');
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const { data: balanceData } = useSWR<{ balance: number }>(
    isConnected ? '/api/wallet/balance' : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data, isLoading } = useSWR<{ positions: Position[] }>(
    isConnected && address ? `/api/positions?user_id=${address}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: tradesData, isLoading: tradesLoading } = useSWR<{ trades: TradeWithMarket[] }>(
    isConnected && address && tab === 'trades'
      ? `/api/trades?user_id=${address}&limit=100`
      : null,
    fetcher,
    { refreshInterval: 10000 }
  );

  const balance = balanceData?.balance ?? 0;
  const positions = data?.positions || [];

  // Calculate totals
  const totalValue = positions.reduce((sum, p) => sum + p.current_price * p.shares, 0);
  const totalPnl = positions.reduce((sum, p) => sum + (p.current_price - p.avg_price) * p.shares, 0);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositAmt) return;
    setActionLoading(true);
    setActionMsg('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/wallet/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(depositAmt) }),
      });
      if (!res.ok) throw new Error('Deposit failed');
      setActionMsg(`Deposited $${depositAmt}`);
      setDepositAmt('');
      setShowDeposit(false);
    } catch {
      setActionMsg('Deposit failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!withdrawAmt) return;
    setActionLoading(true);
    setActionMsg('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(withdrawAmt) }),
      });
      if (!res.ok) throw new Error('Withdraw failed');
      setActionMsg(`Withdrawn $${withdrawAmt}`);
      setWithdrawAmt('');
      setShowWithdraw(false);
    } catch {
      setActionMsg('Withdraw failed');
    } finally {
      setActionLoading(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-20 text-center">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-4" style={{ color: 'var(--text-icon)' }}>
          <path d="M21 12V7H5a2 2 0 010-4h14v4" />
          <path d="M3 5v14a2 2 0 002 2h16v-5" />
          <path d="M18 12a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
        <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>Connect your wallet</p>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>Sign in to view your portfolio, positions, and trade history.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <h1 className="text-[24px] font-bold" style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>Portfolio</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '20px' }}>
        <div className="rounded-[10px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Balance</div>
          <div className="text-[20px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{formatUsd(balance)}</div>
        </div>
        <div className="rounded-[10px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Portfolio Value</div>
          <div className="text-[20px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{formatUsd(totalValue)}</div>
        </div>
        <div className="rounded-[10px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Unrealized P&L</div>
          <div className="text-[20px] font-bold mt-0.5" style={{ color: totalPnl >= 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
            {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
          </div>
        </div>
        <div className="rounded-[10px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Positions</div>
          <div className="text-[20px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{positions.length}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3" style={{ marginBottom: '20px' }}>
        <button
          onClick={() => { setShowDeposit(true); setShowWithdraw(false); }}
          className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-white transition-colors"
          style={{ background: 'var(--brand-blue)' }}
        >
          Deposit
        </button>
        <button
          onClick={() => { setShowWithdraw(true); setShowDeposit(false); }}
          className="rounded-[8px] px-4 py-2 text-[13px] font-medium transition-colors"
          style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          Withdraw
        </button>
        {actionMsg && (
          <span className="text-[12px] font-medium" style={{ color: 'var(--yes-green)' }}>{actionMsg}</span>
        )}
      </div>

      {/* Deposit modal */}
      {showDeposit && (
        <div className="rounded-[12px] mb-4" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Deposit USDC</h3>
            <button onClick={() => setShowDeposit(false)} className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Close</button>
          </div>
          <form onSubmit={handleDeposit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px]" style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number" step="0.01" min="1" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)}
                placeholder="0.00" required
                className="w-full rounded-[8px] pl-7 pr-3 py-2.5 text-[14px] focus:outline-none"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
              />
            </div>
            <button type="submit" disabled={actionLoading} className="rounded-[8px] px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: 'var(--brand-blue)' }}>
              {actionLoading ? '...' : 'Deposit'}
            </button>
          </form>
        </div>
      )}

      {/* Withdraw modal */}
      {showWithdraw && (
        <div className="rounded-[12px] mb-4" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Withdraw USDC</h3>
            <button onClick={() => setShowWithdraw(false)} className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Close</button>
          </div>
          <form onSubmit={handleWithdraw} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px]" style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number" step="0.01" min="1" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)}
                placeholder="0.00" required
                className="w-full rounded-[8px] pl-7 pr-3 py-2.5 text-[14px] focus:outline-none"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
              />
            </div>
            <button type="submit" disabled={actionLoading} className="rounded-[8px] px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: 'var(--no-red)' }}>
              {actionLoading ? '...' : 'Withdraw'}
            </button>
          </form>
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Available: {formatUsd(balance)}</p>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-1" style={{ borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        {(['positions', 'trades'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative px-4 py-2.5 text-[13px] font-medium transition-colors capitalize"
            style={{ color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {t === 'positions' ? 'Positions' : 'Trade History'}
            {tab === t && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: 'var(--brand-blue)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Positions tab */}
      {tab === 'positions' && (
        <>
          {isLoading ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading positions...</div>
          ) : positions.length === 0 ? (
            <div className="rounded-[12px] p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>No open positions.</p>
              <Link href="/markets" className="mt-2 inline-block text-[13px] font-medium" style={{ color: 'var(--brand-blue)' }}>
                Browse markets
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[12px]" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Market</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Outcome</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Shares</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Avg</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Current</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Value</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, i) => {
                    const pnl = (pos.current_price - pos.avg_price) * pos.shares;
                    const value = pos.current_price * pos.shares;
                    return (
                      <tr key={pos.id} style={{ borderBottom: i < positions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td className="px-4 py-3">
                          <Link href={`/event/${pos.slug}`} className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {pos.question}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              background: pos.outcome === 'Yes' ? 'var(--green-bg)' : 'var(--red-bg)',
                              color: pos.outcome === 'Yes' ? 'var(--yes-green)' : 'var(--no-red)',
                            }}
                          >
                            {pos.outcome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{pos.shares.toFixed(0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{(pos.avg_price * 100).toFixed(1)}&cent;</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{(pos.current_price * 100).toFixed(1)}&cent;</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatUsd(value)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums" style={{ color: pnl >= 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
                          {pnl >= 0 ? '+' : ''}{formatUsd(pnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Trade History tab */}
      {tab === 'trades' && (
        <>
          {tradesLoading ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading trade history...</div>
          ) : (tradesData?.trades || []).length === 0 ? (
            <div className="rounded-[12px] p-10 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>No trades yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[12px]" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Market</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Side</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Price</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Size</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Total</th>
                    <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(tradesData?.trades || []).map((t, i) => {
                    const total = Number(t.price) * Number(t.size);
                    return (
                      <tr key={t.id} style={{ borderBottom: i < (tradesData?.trades || []).length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td className="px-4 py-3">
                          {t.slug ? (
                            <Link href={`/event/${t.slug}`} className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {t.question || 'Unknown market'}
                            </Link>
                          ) : (
                            <span style={{ color: 'var(--text-primary)' }}>{t.question || 'Unknown market'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium" style={{ color: t.side === 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
                            {t.side === 0 ? 'Buy' : 'Sell'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{Number(t.price).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{Number(t.size).toFixed(0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>${total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>
                          {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                          {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
