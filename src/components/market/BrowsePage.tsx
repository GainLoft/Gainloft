'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Market } from '@/lib/types';

/** Label that truncates with ellipsis and scrolls on hover when overflowing */
function MarqueeLabel({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [dist, setDist] = useState(0);

  const measure = useCallback(() => {
    if (!outerRef.current || !innerRef.current) return;
    const diff = innerRef.current.scrollWidth - outerRef.current.clientWidth;
    setOverflow(diff > 2);
    setDist(diff > 2 ? -diff - 8 : 0);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, text]);

  return (
    <div ref={outerRef} className={`marquee-wrap ${className ?? ''}`} style={style}>
      <span
        ref={innerRef}
        className={`marquee-inner ${overflow ? 'is-overflowing' : ''}`}
        style={overflow ? { '--marquee-dist': `${dist}px` } as React.CSSProperties : undefined}
      >
        {text}
      </span>
    </div>
  );
}

/** If a label looks like a human name and is too long for a button, use last name */
function shortLabel(label: string): string {
  if (label.length <= 12) return label;
  const words = label.trim().split(/\s+/);
  if (words.length >= 2 && words.every(w => /^[A-Z][a-zA-Z'-]+$/.test(w))) {
    return words[words.length - 1];
  }
  return label;
}

/* ── Sidebar icon for subcategories ── */
function SubIcon({ name }: { name: string }) {
  const s = 16;
  const p = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const key = name.toLowerCase();

  // "All" → grid
  if (key === 'all') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;

  // Countries / regions → globe
  if (['thailand','philippines','indonesia','singapore','malaysia','vietnam','asean','global','south china sea','us-china','middle east','iran','nato','ukraine','ukraine peace deal','ukraine map','gaza','israel','sudan','china','thailand-cambodia','foreign policy','india-pakistan','south korea','yemen','syria','turkey','venezuela'].includes(key))
    return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"/></svg>;

  // AI / OpenAI / Neuralink → CPU chip
  if (['ai','openai','neuralink'].includes(key))
    return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>;

  // Apple / Hardware → laptop
  if (['apple','hardware'].includes(key))
    return <svg {...p}><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M2 17h20M8 21h8"/></svg>;

  // Music / K-pop → music note
  if (['music','k-pop'].includes(key))
    return <svg {...p}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;

  // Movies → film
  if (key === 'movies')
    return <svg {...p}><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/></svg>;

  // Gaming → gamepad
  if (key === 'gaming')
    return <svg {...p}><path d="M6 11h4M8 9v4"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 00-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 003 3c1.11 0 2.08-.402 2.592-1.382L9 15h6l1.408 2.618C16.92 18.598 17.89 19 19 19a3 3 0 003-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0017.32 5z"/></svg>;

  // Awards / Trophy
  if (key === 'awards')
    return <svg {...p}><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 22V14.26a2 2 0 01-.65-3.38L12 8.5l2.65 2.38a2 2 0 01-.65 3.38V22"/><path d="M6 2h12v7a6 6 0 01-12 0V2z"/></svg>;

  // Celebrities → star
  if (key === 'celebrities')
    return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;

  // Startups / Rocket
  if (key === 'startups')
    return <svg {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 3 0 3 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-3 0-3"/></svg>;

  // Robotics → gear/cog
  if (key === 'robotics')
    return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;

  // Space → rocket
  if (key === 'space')
    return <svg {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/></svg>;

  // Nuclear → radiation symbol
  if (key === 'nuclear')
    return <svg {...p}><circle cx="12" cy="12" r="2"/><path d="M12 10V2.5"/><path d="M18.5 16l-5.5-4"/><path d="M5.5 16l5.5-4"/><circle cx="12" cy="12" r="10"/></svg>;

  // Sanctions / Trade Wars / Trade → scale
  if (['sanctions','trade wars','trade'].includes(key))
    return <svg {...p}><path d="M12 3v18"/><path d="M5 7l7-4 7 4"/><path d="M5 7l-2 9h4.3a2 2 0 001.94-1.5L10 12M19 7l2 9h-4.3a2 2 0 01-1.94-1.5L14 12"/></svg>;

  // Diplomacy / US Relations → handshake/people
  if (['diplomacy','us relations'].includes(key))
    return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;

  // Protests → megaphone
  if (key === 'protests')
    return <svg {...p}><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 01-5.8-1.6"/></svg>;

  // Oil → droplet
  if (key === 'oil')
    return <svg {...p}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>;

  // Energy → lightning bolt
  if (key === 'energy')
    return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;

  // El Nino / Disasters → waves/warning
  if (key === 'el nino')
    return <svg {...p}><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>;
  if (key === 'disasters')
    return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

  // Emissions → cloud
  if (key === 'emissions')
    return <svg {...p}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>;

  // Research → flask
  if (key === 'research')
    return <svg {...p}><path d="M9 3h6M10 3v6.5L4 20h16l-6-10.5V3"/></svg>;

  // Paris Agreement → document
  if (key === 'paris agreement')
    return <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;

  // GDP → chart
  if (key === 'gdp')
    return <svg {...p}><path d="M18 20V10M12 20V4M6 20v-6"/></svg>;

  // Labor → briefcase
  if (key === 'labor')
    return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>;

  // Fallback → tag
  return <svg {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

interface BrowsePageProps {
  title: string;
  markets: Market[];
  subtitle?: string;
  filterTags?: string[];
  relatedTopics?: { label: string; href: string }[];
  subcategories?: string[];
}

function MarketCard({ market }: { market: Market }) {
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
      {/* Top: image + title */}
      <div className="flex gap-2.5 mb-3">
        <div className="flex-shrink-0">
          {market.image_url ? (
            <img
              src={market.image_url}
              alt=""
              className="rounded-[6px] object-cover"
              style={{ width: 40, height: 40, background: 'var(--bg-surface)' }}
            />
          ) : (
            <div className="rounded-[6px]" style={{ width: 40, height: 40, background: 'var(--bg-surface)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-[13px] font-semibold leading-[17px] line-clamp-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {market.question}
          </h3>
        </div>
      </div>

      {/* Outcomes */}
      {isMultiOutcome ? (
        <div style={{ flex: 1 }}>
          {displayTokens.slice(0, 3).map((token) => {
            const pct = Math.round(token.price * 100);
            const multi = token.price > 0 ? (1 / token.price) : 0;
            const name = token.label ?? token.outcome;
            return (
              <div key={token.token_id} className="flex items-center justify-between py-[5px]" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-[12px] font-medium truncate mr-2" style={{ color: 'var(--text-primary)' }}>{name}</span>
                <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{multi >= 10 ? multi.toFixed(0) : multi.toFixed(1)}x</span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-2" style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-yes-hover"
            style={{ color: 'var(--yes-green)', background: 'var(--green-bg)', height: 44, overflow: 'hidden', minWidth: 0, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex items-center w-full justify-center" style={{ gap: 4, minWidth: 0 }}>
              <MarqueeLabel text={shortLabel(yesToken?.label ?? 'Yes')} className="text-[13px] font-semibold" style={{ flex: '0 1 auto', minWidth: 0 }} />
              <span className="text-[13px] font-semibold flex-shrink-0 tabular-nums">{yesPct}¢</span>
            </div>
            <span className="text-[10px] tabular-nums" style={{ opacity: 0.7 }}>{yesToken && yesToken.price > 0 ? (1 / yesToken.price).toFixed(2) : '0'}x payout</span>
          </button>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-no-hover"
            style={{ color: 'var(--no-red)', background: 'var(--red-bg)', height: 44, overflow: 'hidden', minWidth: 0, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex items-center w-full justify-center" style={{ gap: 4, minWidth: 0 }}>
              <MarqueeLabel text={shortLabel(noToken?.label ?? 'No')} className="text-[13px] font-semibold" style={{ flex: '0 1 auto', minWidth: 0 }} />
              <span className="text-[13px] font-semibold flex-shrink-0 tabular-nums">{100 - yesPct}¢</span>
            </div>
            <span className="text-[10px] tabular-nums" style={{ opacity: 0.7 }}>{noToken && noToken.price > 0 ? (1 / noToken.price).toFixed(2) : '0'}x payout</span>
          </button>
        </div>
      )}

      {/* Volume footer */}
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

const SORT_OPTIONS = [
  { key: 'volume_24hr', label: '24hr Volume' },
  { key: 'volume', label: 'Total Volume' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'newest', label: 'Newest' },
  { key: 'ending_soon', label: 'Ending Soon' },
  { key: 'competitive', label: 'Competitive' },
];

export default function BrowsePage({ title, markets, filterTags, subcategories }: BrowsePageProps) {
  const [filter, setFilter] = useState('All');
  const [activeSub, setActiveSub] = useState('All');
  const [sortBy, setSortBy] = useState('volume_24hr');
  const [showDropdown, setShowDropdown] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved'>('active');

  const allTags = filterTags || ['All', 'Politics', 'Sports', 'Crypto', 'Finance', 'Tech', 'Culture'];
  const hasSidebar = subcategories && subcategories.length > 0;

  const filtered = (() => {
    let list = markets;
    // Apply subcategory filter
    if (hasSidebar && activeSub !== 'All') {
      list = list.filter((m) =>
        m.question.toLowerCase().includes(activeSub.toLowerCase()) ||
        m.category.toLowerCase().includes(activeSub.toLowerCase())
      );
    }
    // Apply tag filter (only when no sidebar)
    if (!hasSidebar && filter !== 'All') {
      list = list.filter((m) =>
        m.category.toLowerCase().includes(filter.toLowerCase()) ||
        m.question.toLowerCase().includes(filter.toLowerCase())
      );
    }
    return list;
  })();

  const sorted = (() => {
    let list = [...filtered];
    // Status filter
    if (statusFilter === 'resolved') {
      list = list.filter(m => m.resolved);
    } else {
      list = list.filter(m => !m.resolved && m.active);
    }
    // Sort
    switch (sortBy) {
      case 'volume':
        list.sort((a, b) => b.volume - a.volume);
        break;
      case 'liquidity':
        list.sort((a, b) => b.liquidity - a.liquidity);
        break;
      case 'newest':
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'ending_soon':
        list.sort((a, b) => {
          const aEnd = a.end_date_iso ? new Date(a.end_date_iso).getTime() : Infinity;
          const bEnd = b.end_date_iso ? new Date(b.end_date_iso).getTime() : Infinity;
          return aEnd - bEnd;
        });
        break;
      case 'competitive':
        list.sort((a, b) => {
          const aComp = Math.min(...a.tokens.map(t => Math.abs(t.price - 0.5)));
          const bComp = Math.min(...b.tokens.map(t => Math.abs(t.price - 0.5)));
          return aComp - bComp;
        });
        break;
      default: // volume_24hr
        list.sort((a, b) => b.volume_24hr - a.volume_24hr);
    }
    return list;
  })();

  return (
    <div className={hasSidebar ? 'flex gap-0' : ''} style={{ paddingTop: 20 }}>
        {/* Left sidebar — only for pages with subcategories */}
        {hasSidebar && (
          <aside className="hidden lg:block flex-shrink-0" style={{ width: 190, paddingTop: 12 }}>
            <nav style={{ position: 'sticky', top: 68, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              {['All', ...subcategories].map((sub) => (
                <button
                  key={sub}
                  onClick={() => setActiveSub(sub)}
                  className="finance-sidebar-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 10px', borderRadius: 6,
                    fontSize: 13, fontWeight: 600, border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    background: activeSub === sub ? 'var(--bg-hover)' : 'transparent',
                    color: activeSub === sub ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: activeSub === sub ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    <SubIcon name={sub} />
                  </span>
                  {sub}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Page title */}
          <h1 className="text-[28px] font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h1>

          {/* Filter pills — only for pages WITHOUT sidebar */}
          {!hasSidebar && (
            <div className="flex items-center gap-[6px] overflow-x-auto pb-5" style={{ scrollbarWidth: 'none' }}>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setFilter(tag)}
                  className="whitespace-nowrap rounded-full px-3 py-[5px] text-[13px] font-medium pill-hover"
                  style={{
                    background: filter === tag ? 'var(--text-primary)' : 'var(--bg-surface)',
                    color: filter === tag ? 'var(--bg)' : 'var(--text-secondary)',
                    border: filter === tag ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Sort + Status filter bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-[6px] text-[13px] font-medium transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'transparent' }}
              >
                {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                  <div className="absolute top-full left-0 mt-1 rounded-lg py-1 z-20" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 160 }}>
                    {SORT_OPTIONS.map(o => (
                      <button
                        key={o.key}
                        onClick={() => { setSortBy(o.key); setShowDropdown(false); }}
                        className="w-full text-left px-3 py-[7px] text-[13px] font-medium transition-colors"
                        style={{
                          color: sortBy === o.key ? 'var(--brand-blue)' : 'var(--text-primary)',
                          background: sortBy === o.key ? 'var(--bg-hover)' : 'transparent',
                        }}
                        onMouseEnter={(e) => { if (sortBy !== o.key) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { if (sortBy !== o.key) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button
                onClick={() => setStatusFilter('active')}
                className="px-3 py-[5px] text-[13px] font-medium transition-colors"
                style={{
                  background: statusFilter === 'active' ? 'var(--bg-hover)' : 'transparent',
                  color: statusFilter === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('resolved')}
                className="px-3 py-[5px] text-[13px] font-medium transition-colors"
                style={{
                  background: statusFilter === 'resolved' ? 'var(--bg-hover)' : 'transparent',
                  color: statusFilter === 'resolved' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: '1px solid var(--border)',
                }}
              >
                Resolved
              </button>
            </div>
          </div>

          {/* Market card grid */}
          {sorted.length === 0 ? (
            <div className="py-20 text-center text-[14px]" style={{ color: 'var(--text-muted)' }}>
              No markets found
            </div>
          ) : (
            <div className={
              hasSidebar
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
            }>
              {sorted.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          )}

          {/* Show more */}
          <div className="py-8 text-center">
            <button
              className="rounded-full px-6 py-[10px] text-[14px] font-medium card-hover"
              style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              Show more markets
            </button>
          </div>
        </div>
      </div>
  );
}

