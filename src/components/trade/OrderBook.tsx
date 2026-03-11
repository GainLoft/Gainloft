'use client';

import useSWR from 'swr';

interface BookLevel {
  price: string;
  size: string;
}

interface BookData {
  bids: BookLevel[];
  asks: BookLevel[];
  last_trade_price?: number;
}

interface Props {
  marketId: string;
  tokenId: string;
}

const bookFetcher = (url: string) => fetch(url).then((r) => r.json());

export default function OrderBook({ tokenId }: Props) {
  const { data } = useSWR<BookData>(
    `/api/polymarket/book?token_id=${tokenId}`,
    bookFetcher,
    { refreshInterval: 1000 }
  );

  // Aggregate and sort: bids descending, asks ascending by price
  const rawBids = (data?.bids || []).map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
  const rawAsks = (data?.asks || []).map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));
  const bids = rawBids.sort((a, b) => b.price - a.price).slice(0, 10);
  const asks = rawAsks.sort((a, b) => a.price - b.price).slice(0, 10);

  const maxSize = Math.max(
    ...bids.map((b) => b.size),
    ...asks.map((a) => a.size),
    1
  );

  const spread = asks.length > 0 && bids.length > 0 ? asks[0].price - bids[0].price : 0;

  return (
    <div className="rounded-[12px]" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Order Book</h3>
        {spread > 0 && (
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            Spread: {(spread * 100).toFixed(1)}¢
          </span>
        )}
      </div>
      <div className="grid grid-cols-2" style={{ gap: 16, fontSize: 12 }}>
        {/* Bids */}
        <div>
          <div className="flex justify-between font-medium" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
            <span>Bid</span>
            <span>Size</span>
          </div>
          {bids.length === 0 && (
            <div className="py-4 text-center" style={{ color: 'var(--text-muted)' }}>No bids</div>
          )}
          {bids.map((b, i) => {
            const pct = (b.size / maxSize) * 100;
            return (
              <div key={i} className="relative flex justify-between" style={{ padding: '3px 0' }}>
                <div className="absolute inset-0 rounded-sm" style={{ background: 'var(--green-bg)', width: `${pct}%` }} />
                <span className="relative font-medium tabular-nums" style={{ color: 'var(--yes-green)' }}>
                  {(b.price * 100).toFixed(1)}¢
                </span>
                <span className="relative tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {formatSize(b.size)}
                </span>
              </div>
            );
          })}
        </div>
        {/* Asks */}
        <div>
          <div className="flex justify-between font-medium" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
            <span>Ask</span>
            <span>Size</span>
          </div>
          {asks.length === 0 && (
            <div className="py-4 text-center" style={{ color: 'var(--text-muted)' }}>No asks</div>
          )}
          {asks.map((a, i) => {
            const pct = (a.size / maxSize) * 100;
            return (
              <div key={i} className="relative flex justify-between" style={{ padding: '3px 0' }}>
                <div className="absolute inset-0 rounded-sm" style={{ background: 'var(--red-bg)', width: `${pct}%`, right: 0, left: 'auto' }} />
                <span className="relative font-medium tabular-nums" style={{ color: 'var(--no-red)' }}>
                  {(a.price * 100).toFixed(1)}¢
                </span>
                <span className="relative tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {formatSize(a.size)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatSize(size: number): string {
  if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
  return size.toFixed(0);
}
