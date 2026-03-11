'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Market } from '@/lib/types';

// ── Sidebar icon components ──

function SidebarIcon({ name }: { name: string }) {
  const s = 16;
  const p = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'grid': return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case '5min': return <svg {...p}><path d="M4 6h16M4 12h10M4 18h6"/></svg>;
    case '15min': return <svg {...p}><circle cx="12" cy="12" r="9" strokeDasharray="3 3"/><path d="M12 7v5l3 3"/></svg>;
    case 'hourly': return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l-3 3"/><path d="M19 12h2"/></svg>;
    case '4hour': return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>;
    case 'daily': return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case 'weekly': return <svg {...p}><path d="M6 20V14M10 20V10M14 20V6M18 20V4"/></svg>;
    case 'monthly': return <svg {...p}><polyline points="2 18 8 12 14 16 22 6"/></svg>;
    case 'yearly': return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg>;
    case 'premarket': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="8 12 11 15 16 9"/></svg>;
    case 'etf': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="7 17 12 10 17 14"/></svg>;
    default: return null;
  }
}

// Colored logo icons for crypto assets
function CryptoLogo({ name }: { name: string }) {
  switch (name) {
    case 'bitcoin': return (
      <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#F7931A"/><text x="10" y="14.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="system-ui">₿</text></svg>
    );
    case 'ethereum': return (
      <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#627EEA"/><path d="M10 3l5 7.5-5 3-5-3L10 3z" fill="#fff" opacity="0.9"/><path d="M10 14.5l5-4L10 17l-5-6.5 5 4z" fill="#fff" opacity="0.7"/></svg>
    );
    case 'solana': return (
      <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#9945FF"/><path d="M5 13.5h8.5l1.5-1.5H6.5L5 13.5zM5 8l1.5-1.5H15L13.5 8H5zM6.5 11.5H15l-1.5-1.5H5l1.5 1.5z" fill="#fff"/></svg>
    );
    case 'xrp': return (
      <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#23292F"/><path d="M6 6l2.5 3L10 10.5 11.5 9 14 6M6 14l2.5-3L10 9.5l1.5 1.5L14 14" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
    );
    case 'dogecoin': return (
      <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#C3A634"/><text x="10" y="14.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="system-ui">D</text></svg>
    );
    case 'microstrategy': return (
      <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#D32F2F"/><text x="10" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="system-ui">STR</text></svg>
    );
    default: return null;
  }
}

// ── Sidebar config ──

const TIME_ITEMS = [
  { id: 'all', label: 'All', count: 218, icon: 'grid' },
  { id: '5min', label: '5 Min', count: 4, icon: '5min' },
  { id: '15min', label: '15 Min', count: 4, icon: '15min' },
  { id: 'hourly', label: 'Hourly', count: 4, icon: 'hourly' },
  { id: '4hour', label: '4 Hour', count: 4, icon: '4hour' },
  { id: 'daily', label: 'Daily', count: 6, icon: 'daily' },
  { id: 'weekly', label: 'Weekly', count: 63, icon: 'weekly' },
  { id: 'monthly', label: 'Monthly', count: 22, icon: 'monthly' },
  { id: 'yearly', label: 'Yearly', count: 21, icon: 'yearly' },
  { id: 'premarket', label: 'Pre-Market', count: 93, icon: 'premarket' },
  { id: 'etf', label: 'ETF', count: 2, icon: 'etf' },
];

const CRYPTO_ITEMS = [
  { id: 'bitcoin', label: 'Bitcoin', count: 31, logo: 'bitcoin' },
  { id: 'ethereum', label: 'Ethereum', count: 16, logo: 'ethereum' },
  { id: 'solana', label: 'Solana', count: 10, logo: 'solana' },
  { id: 'xrp', label: 'XRP', count: 10, logo: 'xrp' },
  { id: 'dogecoin', label: 'Dogecoin', count: 1, logo: 'dogecoin' },
  { id: 'microstrategy', label: 'Microstrategy', count: 7, logo: 'microstrategy' },
];

const FILTER_PILLS = ['All', 'Up / Down', 'Daily Close', 'Bitcoin', 'Ethereum', 'Solana', 'ETF', 'Pre-Market'];

// ── Helpers ──

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

// ── Market Card ──

function CryptoMarketCard({ market }: { market: Market }) {
  const displayTokens = market.tokens.filter((t) => t.price > 0);
  const isMultiOutcome = displayTokens.length > 2;
  const yesToken = market.tokens.find((t) => t.outcome === 'Yes');
  const noToken = market.tokens.find((t) => t.outcome === 'No');
  const yesPct = yesToken ? Math.round(yesToken.price * 100) : 50;

  return (
    <Link
      href={`/event/${market.slug}`}
      className="rounded-[10px] p-3 flex flex-col card-hover"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', minHeight: 190 }}
    >
      <div className="flex gap-2.5 mb-3">
        <div className="flex-shrink-0">
          {market.image_url ? (
            <img src={market.image_url} alt="" className="rounded-[6px] object-cover" style={{ width: 40, height: 40, background: 'var(--bg-surface)' }} />
          ) : (
            <div className="rounded-[6px]" style={{ width: 40, height: 40, background: 'var(--bg-surface)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold leading-[17px] line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {market.question}
          </h3>
        </div>
      </div>

      {isMultiOutcome ? (
        <div style={{ flex: 1 }}>
          {displayTokens.slice(0, 3).map((token) => {
            const pct = Math.round(token.price * 100);
            const name = token.label ?? token.outcome;
            return (
              <div key={token.token_id} className="flex items-center justify-between py-[5px]" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-[12px] font-medium truncate mr-2" style={{ color: 'var(--text-primary)' }}>{name}</span>
                <span className="text-[13px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-2" style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button className="flex flex-1 items-center justify-center rounded-[6px] text-[13px] font-semibold btn-yes-hover" style={{ color: 'var(--yes-green)', background: 'var(--green-bg)', height: 34, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0 }} onClick={(e) => e.preventDefault()}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{yesToken?.label ?? 'Yes'} {yesPct}¢</span>
          </button>
          <button className="flex flex-1 items-center justify-center rounded-[6px] text-[13px] font-semibold btn-no-hover" style={{ color: 'var(--no-red)', background: 'var(--red-bg)', height: 34, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0 }} onClick={(e) => e.preventDefault()}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{noToken?.label ?? 'No'} {100 - yesPct}¢</span>
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5" style={{ marginTop: 10 }}>
        <svg className="flex-shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 10l3-4 2.5 2L11 2" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {formatVolume(Number(market.volume))} Vol.
        </span>
      </div>
    </Link>
  );
}

// ── Sort options ──

const SORT_OPTS = [
  { key: 'volume_24hr', label: '24hr Volume' },
  { key: 'volume', label: 'Total Volume' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'newest', label: 'Newest' },
  { key: 'ending_soon', label: 'Ending Soon' },
  { key: 'competitive', label: 'Competitive' },
];

// ── Main Component ──

interface CryptoViewProps {
  markets: Market[];
}

export default function CryptoView({ markets }: CryptoViewProps) {
  const [sidebarActive, setSidebarActive] = useState('all');
  const [filterActive, setFilterActive] = useState('All');
  const [sortBy, setSortBy] = useState('volume_24hr');
  const [showSortDrop, setShowSortDrop] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved'>('active');
  const sortLabel = SORT_OPTS.find((o) => o.key === sortBy)?.label ?? '24hr Volume';

  const filtered = (() => {
    let list = markets;

    // Status filter
    if (statusFilter === 'active') {
      list = list.filter((m) => !m.resolved && m.active);
    } else {
      list = list.filter((m) => m.resolved);
    }

    // Sidebar filter — crypto asset
    if (['bitcoin', 'ethereum', 'solana', 'xrp', 'dogecoin', 'microstrategy'].includes(sidebarActive)) {
      list = list.filter((m) =>
        m.question.toLowerCase().includes(sidebarActive.toLowerCase()) ||
        m.category.toLowerCase().includes(sidebarActive.toLowerCase())
      );
    }
    // Filter pill
    if (filterActive !== 'All') {
      const tag = filterActive.toLowerCase();
      list = list.filter((m) =>
        m.question.toLowerCase().includes(tag) ||
        m.category.toLowerCase().includes(tag)
      );
    }
    return list;
  })();

  const sorted = (() => {
    const list = [...filtered];
    switch (sortBy) {
      case 'volume_24hr': list.sort((a, b) => b.volume_24hr - a.volume_24hr); break;
      case 'volume': list.sort((a, b) => b.volume - a.volume); break;
      case 'liquidity': list.sort((a, b) => b.liquidity - a.liquidity); break;
      case 'newest': list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case 'ending_soon': list.sort((a, b) => {
        const aEnd = a.end_date_iso ? new Date(a.end_date_iso).getTime() : Infinity;
        const bEnd = b.end_date_iso ? new Date(b.end_date_iso).getTime() : Infinity;
        return aEnd - bEnd;
      }); break;
      case 'competitive': list.sort((a, b) => {
        const aYes = a.tokens.find((t) => t.outcome === 'Yes');
        const bYes = b.tokens.find((t) => t.outcome === 'Yes');
        const aDist = aYes ? Math.abs(aYes.price - 0.5) : 1;
        const bDist = bYes ? Math.abs(bYes.price - 0.5) : 1;
        return aDist - bDist;
      }); break;
    }
    return list;
  })();

  return (
    <div style={{ display: 'flex', gap: 0, paddingTop: 20 }}>
      {/* ── Left Sidebar ── */}
      <aside className="hidden lg:block" style={{ width: 190, flexShrink: 0, paddingTop: 12 }}>
        <nav style={{ position: 'sticky', top: 68, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {/* Time-based items */}
          {TIME_ITEMS.map((item) => {
            const isActive = sidebarActive === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setSidebarActive(item.id); setFilterActive('All'); }}
                className="finance-sidebar-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 6,
                  fontSize: 13, fontWeight: 600, border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  <SidebarIcon name={item.icon} />
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text-muted)',
                }}>
                  {item.count}
                </span>
              </button>
            );
          })}

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-light)', margin: '8px 12px' }} />

          {/* Crypto asset items */}
          {CRYPTO_ITEMS.map((item) => {
            const isActive = sidebarActive === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setSidebarActive(item.id); setFilterActive('All'); }}
                className="finance-sidebar-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 6,
                  fontSize: 13, fontWeight: 600, border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CryptoLogo name={item.logo} />
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text-muted)',
                }}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Crypto</h1>
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#fff',
            background: 'var(--brand-blue)', borderRadius: 999,
            padding: '2px 8px', lineHeight: '18px',
          }}>
            218
          </span>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'auto', paddingBottom: 16, scrollbarWidth: 'none' as const }}>
          {FILTER_PILLS.map((pill) => {
            const isActive = filterActive === pill;
            return (
              <button
                key={pill}
                onClick={() => setFilterActive(pill)}
                className="pill-hover"
                style={{
                  whiteSpace: 'nowrap', borderRadius: 999,
                  padding: '5px 12px', fontSize: 13, fontWeight: 500,
                  border: isActive ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isActive ? 'var(--text-primary)' : 'var(--bg-surface)',
                  color: isActive ? 'var(--bg)' : 'var(--text-secondary)',
                }}
              >
                {pill}
              </button>
            );
          })}
        </div>

        {/* Sort + Status filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSortDrop(!showSortDrop)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'transparent', cursor: 'pointer' }}
            >
              {sortLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {showSortDrop && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowSortDrop(false)} />
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, borderRadius: 8, padding: '4px 0', zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 160 }}>
                  {SORT_OPTS.map(o => (
                    <button key={o.key} onClick={() => { setSortBy(o.key); setShowSortDrop(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 13, fontWeight: 500, color: sortBy === o.key ? 'var(--brand-blue)' : 'var(--text-primary)', background: sortBy === o.key ? 'var(--bg-hover)' : 'transparent', border: 'none', cursor: 'pointer' }}>{o.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button onClick={() => setStatusFilter('active')} style={{ padding: '5px 12px', fontSize: 13, fontWeight: 500, background: statusFilter === 'active' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>Active</button>
            <button onClick={() => setStatusFilter('resolved')} style={{ padding: '5px 12px', fontSize: 13, fontWeight: 500, background: statusFilter === 'resolved' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'resolved' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer' }}>Resolved</button>
          </div>
        </div>

        {/* Card grid */}
        {sorted.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
            No markets found
          </div>
        ) : (
          <div className="finance-grid">
            {sorted.map((market) => (
              <CryptoMarketCard key={market.id} market={market} />
            ))}
          </div>
        )}

        {/* Show more */}
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <button
            className="card-hover"
            style={{
              borderRadius: 999, padding: '10px 24px', fontSize: 14, fontWeight: 500,
              border: '1px solid var(--border)', color: 'var(--text-primary)',
              background: 'transparent', cursor: 'pointer',
            }}
          >
            Show more markets
          </button>
        </div>
      </div>
    </div>
  );
}
