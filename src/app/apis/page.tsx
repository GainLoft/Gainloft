'use client';

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/markets',
    desc: 'List all markets with pagination, search, and category filtering.',
    params: 'category, search, limit, offset',
  },
  {
    method: 'GET',
    path: '/api/markets/:slug',
    desc: 'Get a single market by its URL slug, including tokens and related markets.',
    params: 'slug (path)',
  },
  {
    method: 'GET',
    path: '/api/markets/:id/holders',
    desc: 'Get the top holders for a market, sorted by position size.',
    params: 'id (path)',
  },
  {
    method: 'GET',
    path: '/api/orders',
    desc: 'Query the order book. Filter by market, token, user, and status.',
    params: 'market_id, token_id, user_id, status',
  },
  {
    method: 'POST',
    path: '/api/orders',
    desc: 'Place a new order. Supports EIP-712 signed orders and unsigned (dev mode).',
    params: 'market_id, token_id, side, price, size, signature (optional)',
  },
  {
    method: 'DELETE',
    path: '/api/orders/:id',
    desc: 'Cancel a live order. Only the order creator can cancel.',
    params: 'id (path)',
  },
  {
    method: 'GET',
    path: '/api/trades',
    desc: 'Query trade history with market and user filters.',
    params: 'market_id, user_id, limit',
  },
  {
    method: 'GET',
    path: '/api/positions',
    desc: 'Get positions for a user, including current prices and P&L.',
    params: 'user_id',
  },
  {
    method: 'GET',
    path: '/api/price-history',
    desc: 'OHLC price history for charting. Supports multiple time periods.',
    params: 'market_id, token_id, period (1h, 6h, 1d, 1w, 1m, all)',
  },
  {
    method: 'GET',
    path: '/api/leaderboard',
    desc: 'Top traders ranked by profit and loss.',
    params: 'period (24h, 7d, 30d, all), limit',
  },
  {
    method: 'GET',
    path: '/api/comments',
    desc: 'Get comments for a market.',
    params: 'market_id',
  },
  {
    method: 'POST',
    path: '/api/comments',
    desc: 'Post a comment on a market. Requires authentication.',
    params: 'market_id, body, parent_id (optional)',
  },
  {
    method: 'GET',
    path: '/api/events/:slug',
    desc: 'Get an event group with its related markets.',
    params: 'slug (path)',
  },
  {
    method: 'GET',
    path: '/api/auth/nonce/:address',
    desc: 'Get a nonce for EIP-712 authentication.',
    params: 'address (path)',
  },
  {
    method: 'POST',
    path: '/api/auth/verify',
    desc: 'Verify a signed message and receive a JWT token.',
    params: 'address, signature',
  },
];

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET: { bg: 'var(--green-bg)', text: 'var(--yes-green)' },
  POST: { bg: 'rgba(20, 82, 240, 0.1)', text: 'var(--brand-blue)' },
  DELETE: { bg: 'var(--red-bg)', text: 'var(--no-red)' },
};

export default function ApisPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <h1 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>API Reference</h1>
      <p className="text-[14px]" style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
        Build on GainLoft with our REST API and WebSocket streams.
      </p>
      <p className="text-[13px]" style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
        Base URL: <code className="rounded px-1.5 py-0.5 text-[12px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>https://api.gainloft.com</code>
      </p>

      {/* Rate limits */}
      <div
        className="rounded-[10px] flex items-center gap-3"
        style={{ padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '24px' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
        </svg>
        <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Rate limit: 100 requests/minute for unauthenticated, 1000/minute for authenticated. WebSocket connections: 10 per IP.
        </span>
      </div>

      {/* Endpoints */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>REST Endpoints</h2>
        </div>
        {ENDPOINTS.map((ep, i) => {
          const colors = METHOD_COLORS[ep.method] || METHOD_COLORS.GET;
          return (
            <div
              key={i}
              className="px-4 py-3.5"
              style={{ borderBottom: i < ENDPOINTS.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {ep.method}
                </span>
                <code className="text-[13px] font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {ep.path}
                </code>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{ep.desc}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Params: <span style={{ color: 'var(--text-secondary)' }}>{ep.params}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* WebSocket */}
      <div
        className="rounded-[12px] mt-6"
        style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>WebSocket</h2>
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Connect to <code className="rounded px-1.5 py-0.5 text-[12px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>wss://api.gainloft.com/ws</code> for real-time price updates.
        </p>
        <div className="rounded-[8px] overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
          <pre className="p-3 text-[12px] overflow-x-auto" style={{ color: 'var(--text-primary)' }}>
{`// Subscribe to market prices
ws.send(JSON.stringify({
  type: "subscribe",
  market_id: "your-market-id"
}));

// Price update message
{
  "type": "price_update",
  "market_id": "...",
  "token_id": "...",
  "price": 0.65,
  "volume": 1234567
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
