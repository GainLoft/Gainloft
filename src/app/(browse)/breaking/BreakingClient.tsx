'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

declare global {
  interface Window { __BREAKING_PROMISE?: Promise<any>; __BREAKING_DATA?: any; }
}

const swrFetcher = (url: string) => fetch(url).then(r => r.json());

interface SidebarMarket {
  id: string;
  question: string;
  slug: string;
  image_url: string | null;
  volume_24hr: number;
  tokens: { outcome: string; price: number }[];
}

interface BreakingMarket {
  id: string;
  slug: string;
  question: string;
  image: string;
  outcomePrices: string[];
  oneDayPriceChange: number;
  livePriceChange: number;
  currentPrice: number;
  clobTokenIds: string[];
  history: { t: number; p: number }[];
  events: { slug: string; seriesSlug?: string; volume: number; image?: string }[];
  closed?: boolean;
}

const BREAKING_CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Politics', value: 'politics' },
  { label: 'World', value: 'world' },
  { label: 'Sports', value: 'sports' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Finance', value: 'finance' },
  { label: 'Tech', value: 'tech' },
  { label: 'Culture', value: 'culture' },
];

// ── Mini Sparkline ──

function MiniSparkline({ prices, width = 84, height = 36 }: { prices: { t: number; p: number }[]; width?: number; height?: number }) {
  if (prices.length < 2) return <div style={{ width, height }} />;

  const maxP = Math.max(...prices.map(p => p.p));
  const minP = Math.min(...prices.map(p => p.p));
  const range = maxP - minP || 0.01;
  const pad = 2;
  const isUp = prices[prices.length - 1].p >= prices[0].p;
  const color = isUp ? 'var(--yes-green)' : 'var(--no-red)';

  const pathData = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.p - minP) / range) * (height - pad * 2);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={pathData} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Breaking Row ──

function BreakingRow({ market, rank }: { market: BreakingMarket; rank: number }) {
  const price = market.currentPrice || parseFloat(market.outcomePrices?.[0] || '0');
  const pct = Math.round(price * 100);
  const change = market.livePriceChange ?? Math.round(market.oneDayPriceChange * 100);
  const isUp = change >= 0;
  const eventSlug = market.events?.[0]?.slug || market.slug;

  return (
    <Link
      href={`/event/${eventSlug}`}
      className="row-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '14px 8px',
        borderBottom: '1px solid var(--border-light)',
        gap: 12,
        textDecoration: 'none',
      }}
    >
      {/* Rank */}
      <span style={{ width: 22, fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', textAlign: 'center', flexShrink: 0 }}>
        {rank}
      </span>

      {/* Image */}
      <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
        {market.image ? (
          <img src={market.image} alt="" style={{ width: 36, height: 36, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 36, height: 36, background: 'var(--bg-surface)', borderRadius: 8 }} />
        )}
      </div>

      {/* Question + Price/Change */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', lineHeight: '20px', marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {market.question}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{pct}%</span>
          {change !== 0 && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: isUp ? 'var(--yes-green)' : 'var(--no-red)',
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              {isUp ? (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><path d="M5 1L9 7H1L5 1Z" /></svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor"><path d="M5 9L1 3H9L5 9Z" /></svg>
              )}
              {Math.abs(change)}%
            </span>
          )}
        </div>
      </div>

      {/* Sparkline */}
      <div className="breaking-sparkline" style={{ flexShrink: 0 }}>
        <MiniSparkline prices={market.history || []} />
      </div>

      {/* Chevron */}
      <svg style={{ width: 16, height: 16, color: 'var(--text-icon)', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Skeleton row ──

function SkeletonRow() {
  return (
    <div className="animate-pulse" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 8px', borderBottom: '1px solid var(--border-light)',
    }}>
      <div style={{ width: 22, height: 14, borderRadius: 3, background: 'var(--bg-surface)' }} />
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-surface)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: '65%', height: 14, borderRadius: 4, background: 'var(--bg-surface)', marginBottom: 6 }} />
        <div style={{ width: '20%', height: 12, borderRadius: 4, background: 'var(--bg-surface)' }} />
      </div>
      <div className="breaking-sparkline" style={{ width: 84, height: 36, borderRadius: 4, background: 'var(--bg-surface)', flexShrink: 0 }} />
      <div style={{ width: 16, height: 16, borderRadius: 3, background: 'var(--bg-surface)', flexShrink: 0 }} />
    </div>
  );
}

// ── Sidebar Card ──

function SidebarCard({ title, icon, markets, loading }: {
  title: string;
  icon: React.ReactNode;
  markets: SidebarMarket[];
  loading: boolean;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Card Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {icon}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      </div>

      {/* Card Body */}
      <div>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{
              padding: '12px 16px',
              borderBottom: i < 4 ? '1px solid var(--border-light)' : 'none',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-surface)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: '80%', height: 12, borderRadius: 3, background: 'var(--bg-surface)', marginBottom: 6 }} />
                <div style={{ width: '30%', height: 10, borderRadius: 3, background: 'var(--bg-surface)' }} />
              </div>
            </div>
          ))
        ) : markets.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No markets found
          </div>
        ) : (
          markets.map((m, i) => {
            const yesPrice = m.tokens?.find(t => t.outcome === 'Yes')?.price ?? 0;
            const pct = Math.round(yesPrice * 100);
            return (
              <Link
                key={m.id}
                href={`/event/${m.slug}`}
                className="row-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 16px',
                  gap: 10,
                  textDecoration: 'none',
                  borderBottom: i < markets.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}
              >
                {/* Image */}
                <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                  {m.image_url ? (
                    <img src={m.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, background: 'var(--bg-surface)' }} />
                  )}
                </div>

                {/* Question + Price */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    lineHeight: '17px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {m.question}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {m.volume_24hr >= 1000 ? `$${(m.volume_24hr / 1000).toFixed(0)}K` : `$${Math.round(m.volume_24hr)}`} vol
                  </div>
                </div>

                {/* Price Badge */}
                <div style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: pct >= 50 ? 'var(--green-bg)' : 'var(--red-bg)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: pct >= 50 ? 'var(--yes-green)' : 'var(--no-red)',
                  flexShrink: 0,
                }}>
                  {pct}%
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Page ──

export default function BreakingClient() {
  const [activeCategory, setActiveCategory] = useState('all');
  const prefetchUsed = useRef(false);

  const [initialData] = useState<{ markets: BreakingMarket[] } | undefined>(() => {
    if (typeof window !== 'undefined' && window.__BREAKING_DATA) {
      const d = window.__BREAKING_DATA;
      window.__BREAKING_DATA = undefined;
      return d;
    }
    return undefined;
  });

  const apiUrl = activeCategory !== 'all'
    ? `/api/polymarket/breaking?category=${encodeURIComponent(activeCategory)}`
    : '/api/polymarket/breaking';

  const { data, isLoading } = useSWR<{ markets: BreakingMarket[] }>(
    apiUrl,
    (url: string) => {
      if (!prefetchUsed.current && activeCategory === 'all' && window.__BREAKING_PROMISE) {
        prefetchUsed.current = true;
        const p = window.__BREAKING_PROMISE;
        window.__BREAKING_PROMISE = undefined;
        return p;
      }
      return fetch(url).then(r => r.json());
    },
    { refreshInterval: 30000, fallbackData: initialData },
  );

  // Sidebar data
  const { data: trendingData, isLoading: trendingLoading } = useSWR<SidebarMarket[]>(
    '/api/polymarket/events?order=volume24hr&limit=6',
    swrFetcher,
    { refreshInterval: 60000 },
  );

  const { data: newestData, isLoading: newestLoading } = useSWR<SidebarMarket[]>(
    '/api/polymarket/events?order=newest&limit=6',
    swrFetcher,
    { refreshInterval: 60000 },
  );

  // Re-sort by absolute livePriceChange (biggest movers first) — matches Polymarket's client-side sort
  const markets = (data?.markets || [])
    .slice()
    .sort((a, b) => Math.abs(b.livePriceChange ?? 0) - Math.abs(a.livePriceChange ?? 0));

  const trendingMarkets = Array.isArray(trendingData) ? trendingData : [];
  const newestMarkets = Array.isArray(newestData) ? newestData : [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingTop: 20, paddingBottom: 32 }}>
      {/* ── Hero Banner ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
            Breaking News
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            See the polymarkets that moved the most in the last 24 hours
          </p>
        </div>
        {/* Decorative thumbs */}
        <div style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" style={{ opacity: 0.15 }}>
            <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" fill="var(--brand-blue)" />
          </svg>
          <svg width="56" height="56" viewBox="0 0 24 24" style={{ opacity: 0.2 }}>
            <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="var(--yes-green)" />
          </svg>
        </div>
      </div>

      {/* ── Category Pills ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', scrollbarWidth: 'none' as const }}>
        {BREAKING_CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            style={{
              padding: '7px 16px',
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: activeCategory === cat.value ? '1px solid var(--brand-blue)' : '1px solid var(--border)',
              background: activeCategory === cat.value ? 'var(--brand-blue)' : 'var(--bg-card)',
              color: activeCategory === cat.value ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Two-column layout: Market List + Sidebar ── */}
      <div className="breaking-layout" style={{ display: 'flex', gap: 24 }}>
        {/* Main — market list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading && markets.length === 0 ? (
            Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
          ) : markets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
              No breaking markets found
            </div>
          ) : (
            markets.map((market, i) => (
              <BreakingRow key={market.id} market={market} rank={i + 1} />
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="breaking-sidebar" style={{ width: 340, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 80 }}>
          {/* Trending */}
          <SidebarCard
            title="Trending"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            }
            markets={trendingMarkets}
            loading={trendingLoading}
          />

          {/* You May Like */}
          <SidebarCard
            title="You May Like"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--yes-green)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            }
            markets={newestMarkets}
            loading={newestLoading}
          />
        </div>
      </div>
    </div>
  );
}
