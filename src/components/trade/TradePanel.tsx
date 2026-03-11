'use client';

import { useState, useRef } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { api } from '@/lib/api';
import { Market } from '@/lib/types';
import { ORDER_DOMAIN, ORDER_TYPES, buildOrderMessage } from '@/lib/eip712';
import { mutate } from 'swr';

interface Props {
  market: Market;
  initialOutcome?: 'Yes' | 'No';
  initialTab?: 'buy' | 'sell';
  /** When true, the component renders without its own card wrapper (border/bg) */
  bare?: boolean;
}

export default function TradePanel({ market, initialOutcome, initialTab, bare }: Props) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [tab, setTab] = useState<'buy' | 'sell'>(initialTab ?? 'buy');
  const [outcome, setOutcome] = useState<'Yes' | 'No'>(initialOutcome ?? 'Yes');

  // Sync when parent changes initialOutcome/initialTab
  const prevOutcome = useRef(initialOutcome);
  const prevTab = useRef(initialTab);
  if (initialOutcome !== undefined && initialOutcome !== prevOutcome.current) {
    prevOutcome.current = initialOutcome;
    setOutcome(initialOutcome);
  }
  if (initialTab !== undefined && initialTab !== prevTab.current) {
    prevTab.current = initialTab;
    setTab(initialTab);
  }
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedToken = market.tokens.find((t) => t.outcome === outcome);
  const currentPrice = selectedToken ? selectedToken.price : 0.5;
  const effectivePrice = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : currentPrice;
  const shares = amount && effectivePrice > 0 ? parseFloat(amount) / effectivePrice : 0;
  const potentialReturn = tab === 'buy' ? (shares * (1 - effectivePrice)).toFixed(2) : '0.00';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !selectedToken || !amount) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const salt = String(Date.now());
      const side = (tab === 'buy' ? 0 : 1) as 0 | 1;
      const priceNum = effectivePrice;
      const sizeNum = shares;

      const orderMsg = buildOrderMessage({
        salt,
        maker: address,
        signer: address,
        tokenId: selectedToken.token_id,
        price: priceNum,
        size: sizeNum,
        side,
      });

      let signature: string | null = null;
      try {
        signature = await signTypedDataAsync({
          domain: ORDER_DOMAIN,
          types: ORDER_TYPES,
          primaryType: 'Order',
          message: orderMsg,
        });
      } catch {
        // Dev mode: continue without signature
      }

      const result = await api.post<{ order: Record<string, unknown>; trades: Array<Record<string, unknown>>; matched: boolean }>('/api/orders', {
        user_id: address,
        market_id: market.id,
        token_id: selectedToken.token_id,
        salt,
        maker: address,
        signer: address,
        taker: '0x0000000000000000000000000000000000000000',
        maker_amount: String(orderMsg.makerAmount),
        taker_amount: String(orderMsg.takerAmount),
        expiration: '0',
        nonce: '0',
        fee_rate_bps: '0',
        side,
        signature_type: 0,
        signature,
        price: priceNum,
        size: sizeNum,
        time_in_force: 'GTC',
      });

      setAmount('');
      setLimitPrice('');
      setSuccess(result.matched ? `Filled ${result.trades.length} trade(s)` : 'Order placed');
      mutate((key: string) => typeof key === 'string' && (key.includes('/api/orders') || key.includes('/api/trades')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setLoading(false);
    }
  }

  const inner = (
    <>
      {/* Buy / Sell tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setTab('buy')}
          className="flex-1 py-2.5 text-[14px] font-semibold transition-colors"
          style={{
            color: tab === 'buy' ? 'var(--yes-green)' : 'var(--text-muted)',
            borderBottom: tab === 'buy' ? '2px solid var(--yes-green)' : '2px solid transparent',
          }}
        >
          Buy
        </button>
        <button
          onClick={() => setTab('sell')}
          className="flex-1 py-2.5 text-[14px] font-semibold transition-colors"
          style={{
            color: tab === 'sell' ? 'var(--no-red)' : 'var(--text-muted)',
            borderBottom: tab === 'sell' ? '2px solid var(--no-red)' : '2px solid transparent',
          }}
        >
          Sell
        </button>
      </div>

      <div className="p-4" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Outcome label */}
        <div className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Outcome</div>

        {/* Outcome selector */}
        {(() => {
          const yesToken = market.tokens.find(t => t.outcome === 'Yes');
          const noToken = market.tokens.find(t => t.outcome === 'No');
          const yesLabel = yesToken?.label || 'Yes';
          const noLabel = noToken?.label || 'No';
          const yesPrice = Math.round((yesToken?.price ?? 0.5) * 100);
          const noPrice = Math.round((noToken?.price ?? 0.5) * 100);
          return (
            <div className="flex gap-2">
              <button
                onClick={() => setOutcome('Yes')}
                className="flex-1 rounded-[8px] py-2.5 text-[14px] font-semibold transition-all"
                style={{
                  background: outcome === 'Yes' ? 'var(--yes-green)' : 'var(--bg-surface)',
                  color: outcome === 'Yes' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {yesLabel} {yesPrice}¢
              </button>
              <button
                onClick={() => setOutcome('No')}
                className="flex-1 rounded-[8px] py-2.5 text-[14px] font-semibold transition-all"
                style={{
                  background: outcome === 'No' ? 'var(--no-red)' : 'var(--bg-surface)',
                  color: outcome === 'No' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {noLabel} {noPrice}¢
              </button>
            </div>
          );
        })()}

        {/* Order type toggle */}
        <div className="flex rounded-[8px] p-0.5" style={{ background: 'var(--bg-surface)' }}>
          <button
            onClick={() => setOrderType('market')}
            className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium transition-all"
            style={{
              background: orderType === 'market' ? 'var(--bg-card)' : 'transparent',
              color: orderType === 'market' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: orderType === 'market' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType('limit')}
            className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium transition-all"
            style={{
              background: orderType === 'limit' ? 'var(--bg-card)' : 'transparent',
              color: orderType === 'limit' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: orderType === 'limit' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Limit
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Amount */}
          <div>
            <label className="mb-1 block text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px]" style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number"
                step="0.01"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-[8px] pl-7 pr-3 py-2.5 text-[14px] focus:outline-none"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
                required
              />
            </div>
          </div>

          {orderType === 'limit' && (
            <div>
              <label className="mb-1 block text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Price</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.99"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder={currentPrice.toFixed(2)}
                  className="w-full rounded-[8px] px-3 py-2.5 text-[14px] focus:outline-none"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                  }}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: 'var(--text-muted)' }}>¢</span>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-[8px] p-3 text-[13px]" style={{ background: 'var(--bg-surface)' }}>
            <div className="flex justify-between" style={{ marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Avg price</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{effectivePrice.toFixed(2)}¢</span>
            </div>
            <div className="flex justify-between" style={{ marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Shares</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{shares > 0 ? shares.toFixed(2) : '—'}</span>
            </div>
            <div className="flex justify-between" style={{ marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Payout multiplier</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{effectivePrice > 0 ? (1 / effectivePrice).toFixed(2) : '—'}x</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Potential return</span>
              <span className="font-medium" style={{ color: 'var(--yes-green)' }}>+${potentialReturn} ({effectivePrice > 0 ? Math.round((1 / effectivePrice - 1) * 100) : 0}%)</span>
            </div>
          </div>

          {error && <p className="text-[13px]" style={{ color: 'var(--no-red)' }}>{error}</p>}
          {success && <p className="text-[13px]" style={{ color: 'var(--yes-green)' }}>{success}</p>}

          <button
            type="submit"
            disabled={loading || !address}
            className="w-full rounded-[8px] py-3 text-[14px] font-semibold text-white transition-all disabled:opacity-40"
            style={{
              background: outcome === 'Yes'
                ? (tab === 'buy' ? 'var(--yes-green)' : 'var(--no-red)')
                : (tab === 'buy' ? 'var(--no-red)' : 'var(--yes-green)'),
            }}
          >
            {!address
              ? 'Connect wallet'
              : loading
              ? 'Placing...'
              : `${tab === 'buy' ? 'Buy' : 'Sell'} ${selectedToken?.label || outcome}`}
          </button>
        </form>

        <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
          By trading, you agree to the Terms of Use
        </p>
      </div>
    </>
  );

  if (bare) return inner;

  return (
    <div className="rounded-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {inner}
    </div>
  );
}
