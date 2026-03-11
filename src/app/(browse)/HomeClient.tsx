'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import MarketCard from '@/components/market/MarketCard';
import { Market } from '@/lib/types';
import { CATEGORIES, getCategorySlug } from '@/lib/categories';
import { useLiveMarkets } from '@/hooks/useLivePrices';

declare global {
  interface Window { __HOME_PROMISE?: Promise<any>; }
}

const swrFetcher = (url: string) => fetch(url).then(r => r.json()).then(d => Array.isArray(d) ? d : []);

const ALL_MARKET_TAGS = ['All', ...CATEGORIES];

function fmtVol(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Chart — renders from candidate history arrays ──

function FeaturedChart({ candidates }: { candidates: { name: string; pct: number; history?: number[] }[] }) {
  const width = 420;
  const height = 210;
  const padL = 0;
  const padR = 42;
  const padT = 10;
  const padB = 10;
  const colors = ['#4393f5', '#6366f1', '#f59e0b', '#e23939'];
  const yLabels = ['100%', '75%', '50%', '25%', '0%'];

  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {yLabels.map((label, i) => {
        const y = padT + (i / (yLabels.length - 1)) * chartH;
        return (
          <g key={label}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--chart-grid)" strokeWidth={1} strokeDasharray="4 3" />
            <text x={width - padR + 8} y={y + 4} fill="var(--text-muted)" fontSize={11} fontFamily="system-ui">{label}</text>
          </g>
        );
      })}
      {candidates.map((c, i) => {
        const hist = c.history || [c.pct];
        const pts = hist.length;
        const d = hist.map((val, j) => {
          const x = padL + (j / (pts - 1)) * chartW;
          const y = padT + (1 - val / 100) * chartH;
          return `${j === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');
        return <path key={c.name} d={d} fill="none" stroke={colors[i]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
      })}
      {candidates.map((c, i) => {
        const y = padT + (1 - c.pct / 100) * chartH;
        return <circle key={c.name} cx={padL + chartW} cy={y} r={4} fill={colors[i]} />;
      })}
    </svg>
  );
}

const BROWSE_FILTERS = [
  { key: 'trending', label: 'Trending' },
  { key: 'new', label: 'New' },
  { key: 'popular', label: 'Popular' },
  { key: 'liquid', label: 'Liquid' },
  { key: 'ending-soon', label: 'Ending Soon' },
  { key: 'competitive', label: 'Competitive' },
];

// ── Page ──

export default function HomeClient() {
  const [allMarketTag, setAllMarketTag] = useState('All');
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const [browseFilter, setBrowseFilter] = useState('trending');
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBookmarked, setShowBookmarked] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved'>('active');

  // ── Fetch real data from database ──
  const prefetchUsed = useRef(false);
  const eventsUrl = allMarketTag === 'All'
    ? '/api/polymarket/events?limit=50&order=volume24hr'
    : `/api/polymarket/events?limit=100&order=volume24hr&tag=${encodeURIComponent(getCategorySlug(allMarketTag))}`;
  const { data: rawMarkets = [], isLoading } = useSWR<Market[]>(
    eventsUrl,
    (url: string) => {
      // Use prefetched promise for initial default load
      if (!prefetchUsed.current && allMarketTag === 'All' && window.__HOME_PROMISE) {
        prefetchUsed.current = true;
        const p = window.__HOME_PROMISE;
        window.__HOME_PROMISE = undefined;
        return p.then((d: any) => Array.isArray(d) ? d : []);
      }
      return fetch(url).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    { refreshInterval: 30000 }
  );

  // Merge live CLOB midpoint prices into all markets
  const allMarkets = useLiveMarkets(rawMarkets);

  // Derive featured markets from top events
  const FEATURED_MARKETS = useMemo(() => {
    // Pick multi-outcome events first, then fill with binary
    const multi = allMarkets.filter(m => m.tokens.length > 2);
    const binary = allMarkets.filter(m => m.tokens.length <= 2);
    const picks = [...multi.slice(0, 4), ...binary.slice(0, 2)].slice(0, 6);
    if (!picks.length) return [];
    return picks.map(m => {
      const candidates = m.tokens.length > 2
        ? m.tokens.slice(0, 4).map(t => ({
            name: t.label || t.outcome,
            pct: Math.round(t.price * 100),
            img: m.image_url || '',
            history: undefined as number[] | undefined,
          }))
        : m.tokens.slice(0, 2).map(t => ({
            name: t.label || t.outcome,
            pct: Math.round(t.price * 100),
            img: m.image_url || '',
            history: undefined as number[] | undefined,
          }));
      return {
        slug: m.slug,
        category: m.category,
        title: m.question,
        image: m.image_url || '',
        volume: fmtVol(m.volume),
        endDate: m.end_date_iso ? fmtDate(m.end_date_iso) : '',
        candidates,
        news: [] as { source: string; color: string; time: string; text: string }[],
        navLabels: [m.category, 'Next'],
      };
    });
  }, [allMarkets]);

  // Derive breaking news from top 3 by 24hr volume
  const BREAKING_NEWS = useMemo(() => {
    return [...allMarkets]
      .sort((a, b) => b.volume_24hr - a.volume_24hr)
      .slice(0, 3)
      .map(m => {
        const yesToken = m.tokens.find(t => t.outcome === 'Yes');
        const pct = yesToken ? Math.round(yesToken.price * 100) : (m.tokens[0] ? Math.round(m.tokens[0].price * 100) : 50);
        return { question: m.question, pct, change: 0, up: true, slug: m.slug };
      });
  }, [allMarkets]);

  // Derive hot topics from tags (aggregated volume per tag label)
  const HOT_TOPICS = useMemo(() => {
    const byTag = new Map<string, { name: string; vol: number; slug: string }>();
    for (const m of allMarkets) {
      const labelsSet = new Set<string>();
      labelsSet.add(m.category);
      if (m.tags) {
        for (const t of m.tags) labelsSet.add(t.label);
      }
      const labels = Array.from(labelsSet);
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const existing = byTag.get(label);
        if (existing) {
          existing.vol += m.volume;
          // Keep the slug of the highest-volume market in this tag
        } else {
          byTag.set(label, { name: label, vol: m.volume, slug: m.slug });
        }
      }
    }
    return Array.from(byTag.values())
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 5)
      .map(t => ({ name: t.name, vol: fmtVol(t.vol) + ' total', slug: t.slug }));
  }, [allMarkets]);

  const featured = FEATURED_MARKETS[featuredIdx] || null;

  function goPrev() { setFeaturedIdx((i) => (i - 1 + FEATURED_MARKETS.length) % FEATURED_MARKETS.length); }
  function goNext() { setFeaturedIdx((i) => (i + 1) % FEATURED_MARKETS.length); }

  const gridMarkets = useMemo(() => {
    let base = allMarkets;
    // Status filter
    if (statusFilter === 'active') {
      base = base.filter((m) => !m.resolved && m.active);
    } else {
      base = base.filter((m) => m.resolved);
    }
    // Category filtering is done server-side via the API query param
    const list = [...base];
    switch (browseFilter) {
      case 'new':
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'popular':
        list.sort((a, b) => b.volume - a.volume);
        break;
      case 'liquid':
        list.sort((a, b) => b.liquidity - a.liquidity);
        break;
      case 'ending-soon':
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
      default: // trending
        list.sort((a, b) => b.volume_24hr - a.volume_24hr);
    }
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.question.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.label.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allMarkets, statusFilter, allMarketTag, browseFilter, searchQuery]);

  return (
    <>
      {/* ── Desktop ── */}
      <div className="hidden lg:block" style={{ paddingTop: 20 }}>
        <div className="relative" style={{ marginRight: '332px' }}>
          {/* Featured card */}
          {!featured ? (
            <div className="rounded-[16px] overflow-hidden flex items-center justify-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 480 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{isLoading ? 'Loading markets...' : 'No markets found'}</div>
            </div>
          ) : (
          <div className="rounded-[16px] px-6 pt-5 pb-6 overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 480 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{featured.category}</div>
              <div className="flex items-center gap-3">
                <button style={{ color: 'var(--text-icon)' }}><svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>
                <button style={{ color: 'var(--text-icon)' }}><svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg></button>
              </div>
            </div>

            <Link href={`/event/${featured.slug}`} className="block">
              <div className="flex gap-8">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-6">
                    <img src={featured.image} alt="" className="h-[48px] w-[48px] rounded-[10px] object-cover flex-shrink-0" />
                    <h2 className="text-[24px] font-bold leading-[30px] tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>
                      {featured.title}
                    </h2>
                  </div>

                  {/* Always render 4 candidate slots for consistent height */}
                  <div>
                    <div className="space-y-[14px]">
                      {featured.candidates.map((c) => (
                        <div key={c.name} className="flex items-center gap-3">
                          {c.img ? (
                            <img src={c.img} alt="" className="h-[36px] w-[36px] rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="h-[36px] w-[36px] rounded-full flex-shrink-0 flex items-center justify-center text-[14px] font-bold" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{c.name.charAt(0)}</div>
                          )}
                          <span className="text-[15px] font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                          <span className="text-[20px] font-bold tabular-nums ml-4" style={{ color: 'var(--text-primary)' }}>{c.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {featured.news.length > 0 && (
                    <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-light)' }}>
                      {featured.news.map((n, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2.5 last:mb-0">
                          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full flex-shrink-0 mt-[1px]" style={{ backgroundColor: n.color }}>
                            <span className="text-[9px] font-bold text-white">{n.source[0]}</span>
                          </span>
                          <div className="min-w-0">
                            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{n.source}</span> · {n.time}
                            </span>
                            <p className="text-[13px] leading-[17px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 text-[13px]" style={{ color: 'var(--text-muted)' }}>{featured.volume} Vol.</div>
                </div>

                <div className="hidden md:flex flex-col w-[380px] flex-shrink-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1 text-[12px]">
                    {featured.candidates.map((c, i) => {
                      const colors = ['#4393f5', '#6366f1', '#f59e0b', '#e23939'];
                      return (
                        <span key={c.name} className="flex items-center gap-1">
                          <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ backgroundColor: colors[i] }} />
                          <span style={{ color: 'var(--text-secondary)' }}>{c.name.split(' ').pop()} {c.pct}%</span>
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex-1 mt-1">
                    <FeaturedChart candidates={featured.candidates} />
                  </div>
                  <div className="flex items-center justify-end text-[11px] gap-1.5 mt-1" style={{ color: 'var(--text-muted)' }}>
                    Ends {featured.endDate} ·
                    <svg width="14" height="14" viewBox="0 0 28 28" fill="none"><path d="M14 0L26 7V21L14 28L2 21V7L14 0Z" fill="var(--text-icon)"/></svg>
                    GainLoft
                  </div>
                </div>
              </div>
            </Link>
          </div>
          )}

          {/* Dots + nav pills */}
          {FEATURED_MARKETS.length > 0 && featured && (
          <div className="flex items-center justify-between mt-3 mb-4">
            <div className="flex items-center gap-1.5">
              {FEATURED_MARKETS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setFeaturedIdx(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === featuredIdx ? 18 : 6,
                    height: 6,
                    background: i === featuredIdx ? 'var(--text-primary)' : 'var(--dot-inactive)',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={goPrev} className="flex items-center gap-1.5 rounded-full px-3 py-[6px] text-[12px] font-medium transition-colors hover:opacity-70" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" d="M15 19l-7-7 7-7"/></svg>
                {featured.navLabels[0]}
              </button>
              <button onClick={goNext} className="flex items-center gap-1.5 rounded-full px-3 py-[6px] text-[12px] font-medium transition-colors hover:opacity-70" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {featured.navLabels[1]}
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
          )}

          {/* Sidebar — absolutely positioned */}
          <aside className="absolute top-0 w-[300px]" style={{ left: 'calc(100% + 32px)' }}>
            <div className="sticky top-[72px]">
              <div style={{ marginBottom: 20 }}>
                <Link href="/markets" className="flex items-center hover:opacity-80" style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                  Breaking news
                  <svg className="h-4 w-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" d="M9 5l7 7-7 7" /></svg>
                </Link>
                {BREAKING_NEWS.map((item, i) => (
                  <Link key={i} href={`/event/${item.slug}`} className="flex items-start rounded transition-colors" style={{ gap: 10, padding: '10px 0', borderBottom: i < BREAKING_NEWS.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <span style={{ fontSize: 14, width: 14, marginTop: 1, flexShrink: 0, color: 'var(--text-muted)' }}>{i + 1}</span>
                    <p className="line-clamp-2 flex-1" style={{ fontSize: 13, fontWeight: 500, lineHeight: '18px', color: 'var(--text-primary)', margin: 0 }}>{item.question}</p>
                    <div className="text-right flex-shrink-0" style={{ marginLeft: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: 'var(--text-primary)' }}>{item.pct}%</div>
                      <div className="flex items-center justify-end" style={{ fontSize: 11, fontWeight: 500, gap: 2, marginTop: 2, color: item.up ? 'var(--yes-green)' : 'var(--no-red)' }}>
                        {item.up ? (
                          <svg style={{ width: 10, height: 10 }} viewBox="0 0 10 10" fill="currentColor"><path d="M5 1L9 7H1L5 1Z"/></svg>
                        ) : (
                          <svg style={{ width: 10, height: 10 }} viewBox="0 0 10 10" fill="currentColor"><path d="M5 9L1 3H9L5 9Z"/></svg>
                        )}
                        {item.change}%
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div>
                <Link href="/markets" className="flex items-center hover:opacity-80" style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                  Hot topics
                  <svg className="h-4 w-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" d="M9 5l7 7-7 7" /></svg>
                </Link>
                {HOT_TOPICS.map((topic, i) => (
                  <Link key={i} href={`/event/${topic.slug}`} className="flex items-center rounded transition-colors" style={{ gap: 10, padding: '9px 0', borderBottom: i < HOT_TOPICS.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <span style={{ fontSize: 14, width: 14, flexShrink: 0, color: 'var(--text-muted)' }}>{i + 1}</span>
                    <span className="flex-1" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{topic.name}</span>
                    <span style={{ fontSize: 13, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{topic.vol}</span>
                    <svg style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--text-icon)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" d="M9 5l7 7-7 7" /></svg>
                  </Link>
                ))}

                <Link href="/markets" className="flex items-center justify-center rounded-[10px] transition-colors" style={{ marginTop: 16, padding: '10px 0', fontSize: 14, fontWeight: 500, border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                  Explore all
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* ── All markets — full width, sits on top of sidebar overflow ── */}
        <div className="relative" style={{ zIndex: 1, background: 'var(--bg)', paddingTop: 32 }}>
          {/* Category tabs + sliders button on same row */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' as const }}>
              {ALL_MARKET_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setAllMarketTag(tag)}
                  style={{
                    position: 'relative', whiteSpace: 'nowrap',
                    padding: '10px 12px', fontSize: 14, fontWeight: 500,
                    color: allMarketTag === tag ? 'var(--brand-blue)' : 'var(--text-secondary)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  {tag === 'Climate' ? 'Climate & Science' : tag}
                  {allMarketTag === tag && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--brand-blue)' }} />}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
              {/* Search */}
              <button
                onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 6, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: showSearch ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
              </button>
              {/* Sliders / Filter */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 6, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: showFilters ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="8" x2="20" y2="8"/>
                  <line x1="4" y1="16" x2="20" y2="16"/>
                  <circle cx="9" cy="8" r="2.5" fill="currentColor" stroke="currentColor"/>
                  <circle cx="15" cy="16" r="2.5" fill="currentColor" stroke="currentColor"/>
                </svg>
              </button>
              {/* Bookmark */}
              <button
                onClick={() => setShowBookmarked(!showBookmarked)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 6, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: showBookmarked ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={showBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Search input row */}
          {showSearch && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search markets..."
                  autoFocus
                  style={{
                    width: '100%', height: 38, borderRadius: 8,
                    paddingLeft: 36, paddingRight: 12, fontSize: 14,
                    background: 'var(--bg-surface)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)', outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* Expandable browse filter row */}
          {showFilters && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' as const }}>
              {BROWSE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setBrowseFilter(f.key)}
                  style={{
                    whiteSpace: 'nowrap', borderRadius: 9999,
                    padding: '6px 14px', fontSize: 13, fontWeight: 600,
                    background: browseFilter === f.key ? 'var(--text-primary)' : 'var(--bg-surface)',
                    color: browseFilter === f.key ? 'var(--bg)' : 'var(--text-secondary)',
                    border: browseFilter === f.key ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Active / Resolved toggle */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button onClick={() => setStatusFilter('active')} style={{ padding: '5px 12px', fontSize: 13, fontWeight: 500, background: statusFilter === 'active' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>Active</button>
              <button onClick={() => setStatusFilter('resolved')} style={{ padding: '5px 12px', fontSize: 13, fontWeight: 500, background: statusFilter === 'resolved' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'resolved' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer' }}>Resolved</button>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
            {isLoading && gridMarkets.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-[10px] animate-pulse" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 190 }} />
              ))
            ) : gridMarkets.length === 0 ? (
              <div className="col-span-full text-center py-8" style={{ color: 'var(--text-muted)', fontSize: 14 }}>No markets found</div>
            ) : (
              gridMarkets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))
            )}
          </div>

          <div className="pb-8 text-center">
            <Link href="/markets" className="text-[13px] font-medium hover:underline" style={{ color: 'var(--brand-blue)' }}>
              Show more markets
            </Link>
          </div>
        </div>
      </div>

      {/* ── Mobile fallback (no sidebar) ── */}
      <div className="lg:hidden pt-5">
        {featured && (
        <>
        <div className="rounded-[16px] px-5 pt-4 pb-5 mb-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Link href={`/event/${featured.slug}`} className="block">
            <div className="text-[13px] mb-2" style={{ color: 'var(--text-secondary)' }}>{featured.category}</div>
            <div className="flex items-center gap-3 mb-4">
              {featured.image ? <img src={featured.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg" style={{ background: 'var(--bg-surface)' }} />}
              <h2 className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>{featured.title}</h2>
            </div>
            {featured.candidates.map((c) => (
              <div key={c.name} className="flex items-center gap-2 py-2">
                {c.img ? (
                  <img src={c.img} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{c.name.charAt(0)}</div>
                )}
                <span className="text-[14px] font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                <span className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>{c.pct}%</span>
              </div>
            ))}
          </Link>
        </div>
        {/* Mobile dots */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            {FEATURED_MARKETS.map((_, i) => (
              <button
                key={i}
                onClick={() => setFeaturedIdx(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === featuredIdx ? 18 : 6,
                  height: 6,
                  background: i === featuredIdx ? 'var(--text-primary)' : 'var(--dot-inactive)',
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="flex items-center justify-center rounded-full w-7 h-7" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button onClick={goNext} className="flex items-center justify-center rounded-full w-7 h-7" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
        </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 className="text-[20px] font-bold italic" style={{ color: 'var(--text-primary)', margin: 0 }}>All markets</h2>
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button onClick={() => setStatusFilter('active')} style={{ padding: '4px 10px', fontSize: 12, fontWeight: 500, background: statusFilter === 'active' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>Active</button>
            <button onClick={() => setStatusFilter('resolved')} style={{ padding: '4px 10px', fontSize: 12, fontWeight: 500, background: statusFilter === 'resolved' ? 'var(--bg-hover)' : 'transparent', color: statusFilter === 'resolved' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer' }}>Resolved</button>
          </div>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 pb-8">
          {gridMarkets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      </div>

    </>
  );
}
