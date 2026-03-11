'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { EventGroup } from '@/lib/types';
import TradePanel from '@/components/trade/TradePanel';
import OutcomeDropdown from '@/components/trade/OutcomeDropdown';
import { useLivePrices, extractTokenIds } from '@/hooks/useLivePrices';

/* ── Types ── */

interface TaxonomyLeague { slug: string; label: string; count: number }
interface TaxonomyItem { slug: string; label: string; count: number; leagues: TaxonomyLeague[] }

interface PageResponse {
  events: EventGroup[];
  hasMore: boolean;
  total: number;
  taxonomy?: TaxonomyItem[];
}

/* ── Helpers ── */

function fmtVol(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
  return `$${vol.toFixed(0)}`;
}

function getLeague(eg: EventGroup): string {
  if (!eg.match) return '';
  return eg.match.league;
}

const LABEL_OVERRIDES: Record<string, string> = {
  'counter-strike-2': 'Counter-Strike 2',
  'league-of-legends': 'League of Legends',
  'honor-of-kings': 'Honor of Kings',
  'dota-2': 'Dota 2',
  'valorant': 'Valorant',
  'ncaa-basketball': 'NCAA Basketball',
  'ncaa-cbb': 'NCAA Basketball',
  'table-tennis': 'Table Tennis',
  'ping-pong': 'Table Tennis',
  'la-liga': 'La Liga',
  'arg': 'Argentina Primera División',
  'brazil-serie-a': 'Brazil Serie A',
  'japan-j2-league': 'Japan J2 League',
};

const COLOR_MAP: Record<string, string> = {
  LAL: '#552583', BOS: '#007A33', GSW: '#1D428A', DEN: '#0E2240',
  MIA: '#98002E', NYK: '#F58426', PHI: '#006BB6', TOR: '#CE1141',
  DAL: '#00538C', SAC: '#5A2D81', NOP: '#0C2340', PHX: '#E56020',
  IND: '#002D62', LAC: '#C8102E', SAS: '#848484',
  MON: '#AF1E2D', ANA: '#F47A38', MIN: '#154734', LAS: '#B4975A',
  STL: '#002F87', SJ: '#006D75',
  NEC: '#C8102E', PUM: '#003DA5', DRAW: '#6B7280',
  T1: '#E2012D', GEN: '#AA8B56', PRX: '#E84C30', DRX: '#5A8DEE', HLE: '#FF6B00',
};
function teamColor(abbr: string): string {
  return COLOR_MAP[abbr.toUpperCase()] || `hsl(${Math.abs(Array.from(abbr).reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360}, 55%, 40%)`;
}

function sportColor(slug: string): string {
  const h = Math.abs(Array.from(slug).reduce((acc, c) => c.charCodeAt(0) + ((acc << 5) - acc), 0)) % 360;
  return `hsl(${h}, 60%, 45%)`;
}

const PAGE_SIZE = 30;

/* ── Loading skeleton ── */
function MatchSkeleton() {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 16,
      background: 'var(--bg-card)', marginBottom: 12, overflow: 'hidden', opacity: 0.5,
    }}>
      <div style={{ padding: '14px 20px 0', display: 'flex', gap: 10 }}>
        <div style={{ width: 180, height: 28, borderRadius: 6, background: 'var(--bg-surface)' }} />
        <div style={{ width: 200, height: 16, borderRadius: 4, background: 'var(--bg-surface)', marginTop: 6 }} />
      </div>
      <div style={{ padding: '14px 20px 18px', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 32, borderRadius: 8, background: 'var(--bg-surface)' }} />
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-surface)' }} />
              <div style={{ width: 140, height: 16, borderRadius: 4, background: 'var(--bg-surface)' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 148, height: 52, borderRadius: 12, background: 'var(--bg-surface)' }} />
          <div style={{ width: 148, height: 52, borderRadius: 12, background: 'var(--bg-surface)' }} />
        </div>
      </div>
    </div>
  );
}

/* ── Match Card ── */
function MatchCard({
  event, isSelected, onSelect, onOutcomeClick, livePrices,
}: {
  event: EventGroup;
  isSelected: boolean;
  onSelect: () => void;
  onOutcomeClick: (marketTypeLabel: string, outcomeIdx: number, marketId?: string) => void;
  livePrices?: Record<string, { mid: number }>;
}) {
  const m = event.match!;
  const t1 = m.team1;
  const t2 = m.team2;

  const ml = m.market_types.find((mt) => mt.label === 'Moneyline' || mt.label === 'Winner' || mt.label === 'Match Winner') ?? m.market_types[0];

  // Use live CLOB prices if available, otherwise fall back to stored prices
  const getLivePrice = (marketTypeMarket: { id?: string; price: number }, fallback: number): number => {
    if (!livePrices || !marketTypeMarket?.id) return fallback;
    // The market_type market id maps to a market in the event; find the Yes token
    const baseId = marketTypeMarket.id.replace(/-\d+$/, '');
    const mkt = event.markets.find(m => m.id === baseId);
    if (mkt) {
      const yesToken = mkt.tokens.find(t => t.outcome === 'Yes');
      if (yesToken && livePrices[yesToken.token_id]) {
        return livePrices[yesToken.token_id].mid;
      }
    }
    return fallback;
  };

  const t1Price = getLivePrice(ml?.markets[0], ml?.markets[0]?.price ?? 0);
  const t2Price = 1 - t1Price; // No price is complement of Yes
  const is3Way = ml && ml.markets.length >= 3;
  const drawPrice = is3Way ? getLivePrice(ml.markets[2], ml.markets[2]?.price ?? 0) : 0;

  // Find spread and O/U for additional rows (pick first of each type, skip settled)
  const isActive = (mt: typeof m.market_types[0]) => {
    const p0 = mt.markets[0]?.price ?? 0;
    const p1 = mt.markets[1]?.price ?? 0;
    return p0 > 0.01 && p0 < 0.99 && p1 > 0.01 && p1 < 0.99;
  };
  const spreadMt = m.market_types.find((mt) =>
    /spread|handicap|\(-?\d/i.test(mt.label) && mt !== ml && isActive(mt)
  );
  const ouMt = m.market_types.find((mt) =>
    /O\/U\s|totals|over.?under/i.test(mt.label) && mt !== ml && isActive(mt)
  );

  const gameLabel = m.league.split(' ').slice(0, 3).join(' ');
  const statusLabel = m.status === 'live' ? 'LIVE'
    : m.status === 'final' ? 'FINAL'
    : m.status_detail || new Date(m.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const headerLeft = m.status_detail && m.status === 'live'
    ? m.status_detail
    : `${gameLabel} \u00b7 ${statusLabel}`;

  const gameViewCount = m.game_views ?? m.market_types.length;

  return (
    <div
      onClick={onSelect}
      style={{
        cursor: 'pointer', marginBottom: 12,
        border: '1px solid var(--border)',
        borderRadius: 16,
        background: isSelected ? 'var(--bg-hover)' : 'var(--bg-card)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {m.status === 'live' && (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>LIVE</span>
            </>
          )}
          <span style={{
            fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
            background: 'var(--bg-surface)', borderRadius: 6, padding: '3px 10px',
            whiteSpace: 'nowrap',
          }}>
            {headerLeft}
          </span>
          <span style={{
            fontSize: 14, color: 'var(--text-muted)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {fmtVol(event.volume)} Vol.&middot; {m.league}
          </span>
        </div>
        <Link href={`/event/${event.slug}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: '1px solid var(--border)', borderRadius: 999,
            padding: '5px 12px', whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-surface)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
            }}>{gameViewCount}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Game View &rsaquo;</span>
          </span>
        </Link>
      </div>
      <div style={{ padding: '14px 20px 18px' }}>
        {/* Team rows + moneyline prices */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[{ team: t1, score: m.score?.team1 }, { team: t2, score: m.score?.team2 }].map(({ team, score }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  minWidth: 36, height: 32, borderRadius: 8, background: 'var(--bg-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px',
                }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {score ?? 0}
                  </span>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  overflow: 'hidden', background: team.logo ? 'transparent' : `${teamColor(team.abbr)}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {team.logo ? (
                    <img src={team.logo} alt={team.abbr} style={{ width: 32, height: 32, objectFit: 'contain' }}
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = 'none';
                        el.parentElement!.style.background = `${teamColor(team.abbr)}22`;
                        el.parentElement!.innerHTML = `<span style="font-size:13px;font-weight:700;color:${teamColor(team.abbr)}">${team.abbr}</span>`;
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 700, color: teamColor(team.abbr) }}>{team.abbr}</span>
                  )}
                </div>
                <span style={{
                  fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {team.name}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, marginLeft: 16 }}>
            <button
              className="btn-yes-hover"
              onClick={(e) => { e.stopPropagation(); if (ml) onOutcomeClick(ml.label, 0, ml.markets[0]?.id); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '7px 0', borderRadius: 8,
                background: 'var(--green-bg)', color: 'var(--yes-green)',
                border: 'none', cursor: 'pointer',
                minWidth: 130, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t1.abbr} {Math.round(t1Price * 100)}¢
            </button>
            {is3Way && (
              <button
                onClick={(e) => { e.stopPropagation(); if (ml) onOutcomeClick(ml.label, 2, ml.markets[2]?.id); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '7px 0', borderRadius: 8,
                  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                  minWidth: 130, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                }}
              >
                Draw {Math.round(drawPrice * 100)}¢
              </button>
            )}
            <button
              className="btn-no-hover"
              onClick={(e) => { e.stopPropagation(); if (ml) onOutcomeClick(ml.label, 1, ml.markets[1]?.id); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '7px 0', borderRadius: 8,
                background: 'var(--red-bg)', color: 'var(--no-red)',
                border: 'none', cursor: 'pointer',
                minWidth: 130, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t2.abbr} {Math.round(t2Price * 100)}¢
            </button>
          </div>
        </div>

        {/* Additional market type rows (spread, O/U) */}
        {(spreadMt || ouMt) && (
          <div style={{
            display: 'flex', gap: 8, marginTop: 10, paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}>
            {[spreadMt, ouMt].filter(Boolean).map((mt) => {
              const p0 = mt!.markets[0];
              const p1 = mt!.markets[1];
              return (
                <button
                  key={mt!.id}
                  onClick={(e) => { e.stopPropagation(); onOutcomeClick(mt!.label, 0); }}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>
                    {mt!.label.replace(/^(More Markets|Halftime Result|Team Top Batter|Most Sixes|Toss Match Double):\s*/i, '')}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {p0.label.slice(0, 6)} {Math.round(p0.price * 100)}¢
                    {' · '}
                    {p1.label.slice(0, 6)} {Math.round(p1.price * 100)}¢
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Futures Card ── */
function FuturesCard({
  event, onOutcomeClick,
}: {
  event: EventGroup;
  onOutcomeClick: (marketId: string) => void;
}) {
  const outcomes = event.markets
    .map(m => {
      const yesToken = m.tokens.find(t => t.outcome === 'Yes');
      const label = m.group_item_title || m.question?.replace(/^Will\s+/i, '').replace(/\s+win.*$/i, '') || 'Yes';
      return { id: m.id, label, price: yesToken?.price ?? 0 };
    })
    .sort((a, b) => b.price - a.price)
    .slice(0, 8);

  const totalOutcomes = event.markets.length;

  return (
    <Link href={`/event/${event.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 12 }}>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 16,
        background: 'var(--bg-card)', overflow: 'hidden', cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 10px' }}>
          {event.image_url && (
            <img src={event.image_url} alt="" style={{
              width: 28, height: 28, borderRadius: 6, objectFit: 'contain', flexShrink: 0,
            }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {event.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {fmtVol(event.volume)} Vol. &middot; {totalOutcomes} outcomes
            </div>
          </div>
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {outcomes.map((o) => {
            const cents = Math.round(o.price * 100);
            return (
              <button
                key={o.id}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOutcomeClick(o.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-surface)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  color: 'var(--text-primary)', whiteSpace: 'nowrap',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{o.label}</span>
                <span style={{
                  fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums',
                  color: cents >= 50 ? 'var(--yes-green)' : 'var(--text-secondary)',
                }}>{cents}¢</span>
              </button>
            );
          })}
          {totalOutcomes > 8 && (
            <span style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              +{totalOutcomes - 8} more
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── Filter Panel ── */
function FilterPanel({
  minVolume, onMinVolumeChange, onClose,
}: {
  minVolume: number;
  onMinVolumeChange: (v: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
      width: 220, borderRadius: 12, padding: 16,
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Min volume</div>
      {[0, 1000, 10000, 100000].map((v) => (
        <button key={v} onClick={() => onMinVolumeChange(v)} style={{
          display: 'inline-block', marginRight: 6, marginBottom: 6,
          padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          border: '1px solid var(--border)', cursor: 'pointer',
          background: minVolume === v ? 'var(--bg-hover)' : 'transparent',
          color: minVolume === v ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}>
          {v === 0 ? 'Any' : fmtVol(v)}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════ */
interface SportsClientProps {
  initialEvents: EventGroup[];
  initialTaxonomy: TaxonomyItem[];
  initialHasMore: boolean;
  initialTotal: number;
}

export default function SportsClient({ initialEvents, initialTaxonomy, initialHasMore, initialTotal }: SportsClientProps) {
  const [viewTab, setViewTab] = useState<'live' | 'futures'>('live');
  const [activeFilter, setActiveFilter] = useState<{ type: 'sport' | 'league'; slug: string; sport?: string } | null>(null);
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [minVolume, setMinVolume] = useState(0);

  const [selectedEvent, setSelectedEvent] = useState<EventGroup | null>(null);
  const [selectedMarketType, setSelectedMarketType] = useState<string>('');
  const [selectedOutcomeIdx, setSelectedOutcomeIdx] = useState(0);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [buyMode, setBuyMode] = useState<'buy' | 'sell'>('buy');

  /* ── Infinite scroll state ── */
  const [events, setEvents] = useState<EventGroup[]>(initialEvents);
  const [taxonomy, setTaxonomy] = useState<TaxonomyItem[]>(initialTaxonomy);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(initialEvents.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Build API URL ── */
  const buildUrl = useCallback((offset: number) => {
    const params = new URLSearchParams({
      tab: viewTab,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    if (activeFilter?.type === 'sport') {
      params.set('sport', activeFilter.slug);
    } else if (activeFilter?.type === 'league') {
      params.set('league', activeFilter.slug);
      if (activeFilter.sport) params.set('sport', activeFilter.sport);
    }
    return `/api/polymarket/sports?${params.toString()}`;
  }, [viewTab, activeFilter]);

  /* ── Fetch a page ── */
  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) setIsLoadingMore(true);
    else setIsLoading(true);

    try {
      const res = await fetch(buildUrl(offset), { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PageResponse = await res.json();

      if (append) {
        setEvents(prev => [...prev, ...data.events]);
      } else {
        setEvents(data.events);
        if (data.taxonomy) setTaxonomy(data.taxonomy);
      }
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Sports fetch error:', err);
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [buildUrl]);

  /* ── Reset & fetch first page when filters change ── */
  const initialLoadRef = useRef(true);
  useEffect(() => {
    // Skip initial fetch only if we have SSR data for the default tab
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      if (viewTab === 'live' && !activeFilter && initialEvents.length > 0) return;
    }
    setEvents([]);
    setHasMore(false);
    setSelectedEvent(null);
    fetchPage(0, false);
  }, [viewTab, activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── IntersectionObserver for infinite scroll ── */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !fetchingRef.current) {
          fetchPage(events.length, true);
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, events.length, fetchPage]);

  /* ── Auto-refresh event list every 60s (structure only, prices via live polling) ── */
  useEffect(() => {
    const interval = setInterval(() => {
      if (!fetchingRef.current && events.length > 0) {
        const controller = new AbortController();
        fetch(buildUrl(0), { signal: controller.signal })
          .then(r => r.json())
          .then((data: PageResponse) => {
            if (data.taxonomy) setTaxonomy(data.taxonomy);
            setEvents(prev => {
              const newMap = new Map(data.events.map(e => [e.id, e]));
              return prev.map(e => newMap.get(e.id) || e);
            });
          })
          .catch(() => {});
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [buildUrl, events.length]);

  /* ── Live price polling (1s) ── */
  const allTokenIds = useMemo(() => extractTokenIds(events), [events]);
  const livePrices = useLivePrices(allTokenIds, 1000);

  /* ── Client-side sort & filter ── */
  const displayEvents = useMemo(() => {
    let list = [...events];
    if (minVolume > 0) list = list.filter(eg => eg.volume >= minVolume);
    return list;
  }, [events, minVolume]);

  /* ── Build lookup sets from taxonomy for grouping ── */
  const { leagueSlugs, sportSlugs, labelMap, leagueCounts } = useMemo(() => {
    const ls = new Set<string>();
    const ss = new Set<string>();
    const lm: Record<string, string> = {};
    const lc: Record<string, number> = {};
    for (const sport of taxonomy) {
      ss.add(sport.slug);
      lm[sport.slug] = sport.label;
      lc[sport.slug] = sport.count;
      for (const league of sport.leagues) {
        ls.add(league.slug);
        lm[league.slug] = league.label;
        lc[league.slug] = league.count;
      }
    }
    return { leagueSlugs: ls, sportSlugs: ss, labelMap: lm, leagueCounts: lc };
  }, [taxonomy]);

  /* ── Derive grouping tag for an event (like Polymarket) ── */
  const getGroupTag = useCallback((eg: EventGroup): string => {
    const slugs = (eg.tags || []).map(t => t.slug.toLowerCase());
    // Collect ALL matching league slugs, pick the most specific (lowest count)
    let bestLeague = '';
    let bestCount = Infinity;
    for (const s of slugs) {
      if (leagueSlugs.has(s)) {
        const c = leagueCounts[s] ?? Infinity;
        if (c < bestCount) { bestLeague = s; bestCount = c; }
      }
    }
    if (bestLeague) return bestLeague;
    // Fall back to parent sport
    for (const s of slugs) {
      if (sportSlugs.has(s)) return s;
    }
    return eg.match?.league || 'Sports';
  }, [leagueSlugs, sportSlugs, leagueCounts]);

  /* ── Group matches by sport/league tag ── */
  const grouped: Record<string, EventGroup[]> = {};
  if (viewTab === 'live') {
    displayEvents.forEach((eg) => {
      if (!eg.match) return;
      if (eg.match.status !== 'live') return; // Only show live matches on live tab
      const groupKey = getGroupTag(eg);
      if (!grouped[groupKey]) grouped[groupKey] = [];
      grouped[groupKey].push(eg);
    });
    // Within each group: top 2 by volume
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => (b.volume || 0) - (a.volume || 0));
      grouped[key] = grouped[key].slice(0, 2);
    }
  }
  // Group order: highest total volume first
  const sortedLeagues = Object.keys(grouped).sort((a, b) => {
    const aVol = grouped[a].reduce((sum, e) => sum + (e.volume || 0), 0);
    const bVol = grouped[b].reduce((sum, e) => sum + (e.volume || 0), 0);
    return bVol - aVol;
  });

  const sel = selectedEvent && displayEvents.find(e => e.id === selectedEvent.id)
    ? selectedEvent
    : (viewTab === 'live' ? displayEvents[0] ?? null : null);
  const selMatch = sel?.match;

  const handleOutcomeClick = useCallback((event: EventGroup, marketTypeLabel: string, outcomeIdx: number, marketId?: string) => {
    setSelectedEvent(event);
    setSelectedMarketType(marketTypeLabel);
    setSelectedOutcomeIdx(outcomeIdx);
    setBuyMode('buy');
    // For 3-way markets, map the market_type market id to the actual event market
    if (marketId) {
      const baseId = marketId.replace(/-\d+$/, '');
      const match = event.markets.find(m => m.id === baseId);
      if (match) setSelectedMarketId(match.id);
    }
  }, []);

  const handleSelectEvent = useCallback((event: EventGroup) => {
    setSelectedEvent(event);
    setSelectedMarketType('');
    setSelectedOutcomeIdx(0);
  }, []);

  const toggleExpand = useCallback((slug: string) => {
    setExpandedSports(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }, []);

  const isEmpty = !isLoading && displayEvents.length === 0;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1350, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 8 }}>

          {/* ═══ LEFT SIDEBAR ═══ */}
          <aside className="hidden lg:block" style={{ width: 210, flexShrink: 0, paddingTop: 12 }}>
            <nav className="hide-scrollbar" style={{ position: 'sticky', top: 68, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
              {(['live', 'futures'] as const).map((tab) => (
                <button key={tab} onClick={() => { setViewTab(tab); setActiveFilter(null); }} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, border: 'none',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  letterSpacing: '-0.09px',
                  background: viewTab === tab && !activeFilter ? 'var(--bg-hover)' : 'transparent',
                  color: viewTab === tab && !activeFilter ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {tab === 'live' && <span className="live-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--no-red, #ef4444)' }} />}
                  {tab === 'live' ? 'Live' : 'Futures'}
                </button>
              ))}

              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '0.25px', padding: '16px 12px 8px', textTransform: 'uppercase',
              }}>
                All Sports
              </div>

              {taxonomy.map((sport) => {
                const isActiveSport = activeFilter?.type === 'sport' && activeFilter.slug === sport.slug;
                const isActiveLeagueParent = activeFilter?.type === 'league' && activeFilter.sport === sport.slug;
                const isExpanded = expandedSports.has(sport.slug) || isActiveSport || isActiveLeagueParent;
                const hasLeagues = sport.leagues.length > 0;

                return (
                  <div key={sport.slug}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        onClick={() => {
                          if (isActiveSport) {
                            setActiveFilter(null);
                          } else {
                            setActiveFilter({ type: 'sport', slug: sport.slug });
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 8, flex: 1, minWidth: 0,
                          fontSize: 14, fontWeight: 600, border: 'none',
                          cursor: 'pointer', textAlign: 'left',
                          letterSpacing: '-0.09px',
                          background: isActiveSport ? 'var(--bg-hover)' : 'transparent',
                          color: (isActiveSport || isActiveLeagueParent) ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sportColor(sport.slug), flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sport.label}</span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 6 }}>
                          {sport.count}
                        </span>
                      </button>
                      {hasLeagues && (
                        <button
                          onClick={() => toggleExpand(sport.slug)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: 'transparent', color: 'var(--text-muted)', flexShrink: 0,
                            fontSize: 12, transition: 'transform 0.15s',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M3 4.5L6 7.5L9 4.5" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {isExpanded && hasLeagues && (
                      <div style={{ paddingLeft: 28, paddingBottom: 4 }}>
                        {sport.leagues.map((league) => {
                          const isActiveLeague = activeFilter?.type === 'league' && activeFilter.slug === league.slug;
                          return (
                            <button
                              key={league.slug}
                              onClick={() => {
                                if (isActiveLeague) {
                                  setActiveFilter(null);
                                } else {
                                  setActiveFilter({ type: 'league', slug: league.slug, sport: sport.slug });
                                }
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '6px 10px', borderRadius: 6, width: '100%',
                                fontSize: 13, fontWeight: 500, border: 'none',
                                cursor: 'pointer', textAlign: 'left',
                                background: isActiveLeague ? 'var(--bg-hover)' : 'transparent',
                                color: isActiveLeague ? 'var(--text-primary)' : 'var(--text-muted)',
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {league.label}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6 }}>
                                {league.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* ═══ CENTER CONTENT ═══ */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: 756, paddingTop: 12, paddingLeft: 32, paddingBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                {activeFilter
                  ? taxonomy.find(s => s.slug === (activeFilter.sport || activeFilter.slug))?.label
                    || activeFilter.slug
                  : viewTab === 'live' ? 'Live' : 'Futures'}
                {activeFilter?.type === 'league' && (
                  <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 8 }}>
                    / {taxonomy.find(s => s.slug === activeFilter.sport)?.leagues.find(l => l.slug === activeFilter.slug)?.label || activeFilter.slug}
                  </span>
                )}
              </h1>
              {!isLoading && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                  {total.toLocaleString()} events
                </span>
              )}
              <div style={{ position: 'relative', marginLeft: 'auto' }}>
                <button
                  onClick={() => setFilterOpen(!filterOpen)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: filterOpen ? 'var(--bg-hover)' : 'transparent',
                    color: minVolume > 0 ? 'var(--brand-blue, #3b82f6)' : 'var(--text-secondary)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="8" x2="20" y2="8" />
                    <line x1="4" y1="16" x2="20" y2="16" />
                    <circle cx="9" cy="8" r="2.5" fill="var(--bg)" />
                    <circle cx="15" cy="16" r="2.5" fill="var(--bg)" />
                  </svg>
                </button>
                {filterOpen && (
                  <FilterPanel
                    minVolume={minVolume}
                    onMinVolumeChange={(v) => { setMinVolume(v); setSelectedEvent(null); }}
                    onClose={() => setFilterOpen(false)}
                  />
                )}
              </div>
            </div>

            {isLoading ? (
              <div>{[0, 1, 2].map((i) => <MatchSkeleton key={i} />)}</div>
            ) : isEmpty ? (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
                {viewTab === 'futures' ? 'No futures available' : 'No matches available'}
              </div>
            ) : viewTab === 'futures' ? (
              <>
                {displayEvents.map((event) => (
                  <FuturesCard
                    key={event.id}
                    event={event}
                    onOutcomeClick={(marketId) => {
                      setSelectedEvent(event);
                      setSelectedMarketId(marketId);
                      setSelectedOutcomeIdx(0);
                      setBuyMode('buy');
                    }}
                  />
                ))}
              </>
            ) : (
              <>
                {sortedLeagues.map((groupKey) => {
                  const leagueEvents = grouped[groupKey];
                  const hasLive = leagueEvents.some(e => e.match?.status === 'live');
                  const displayLabel = LABEL_OVERRIDES[groupKey] || labelMap[groupKey] || groupKey;
                  const leagueImage = leagueEvents[0]?.match?.event_image || leagueEvents[0]?.image_url || '';
                  return (
                    <div key={groupKey} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        {leagueImage && (
                          <img src={leagueImage} alt="" style={{
                            width: 24, height: 24, borderRadius: 6, objectFit: 'contain', flexShrink: 0,
                          }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        {hasLive && (
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.18px' }}>
                          {displayLabel}
                        </span>
                      </div>
                      {leagueEvents.map((event) => (
                        <MatchCard
                          key={event.id}
                          event={event}
                          isSelected={sel?.id === event.id}
                          onSelect={() => handleSelectEvent(event)}
                          onOutcomeClick={(marketLabel, idx, mId) => handleOutcomeClick(event, marketLabel, idx, mId)}
                          livePrices={livePrices}
                        />
                      ))}
                    </div>
                  );
                })}
              </>
            )}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} style={{ height: 1 }} />

            {isLoadingMore && (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontSize: 13, color: 'var(--text-muted)', fontWeight: 500,
                }}>
                  <span style={{
                    width: 16, height: 16, border: '2px solid var(--border)',
                    borderTopColor: 'var(--text-muted)', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Loading more...
                </div>
              </div>
            )}

            {!hasMore && !isLoading && displayEvents.length > 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                Showing all {displayEvents.length} of {total} events
              </div>
            )}
          </div>

          {/* ═══ RIGHT TRADE PANEL ═══ */}
          <div className="hidden lg:block" style={{ width: 372, flexShrink: 0, paddingTop: 12, marginLeft: 24 }}>
            {sel && selMatch && sel.markets?.[0] ? (() => {
              const tradeMarket = sel.markets.find(m => m.id === selectedMarketId) ?? sel.markets[0];
              return (
                <div style={{ position: 'sticky', top: 68 }}>
                  <div className="rounded-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <OutcomeDropdown
                      markets={sel.markets}
                      selectedId={tradeMarket.id}
                      onSelect={(id) => setSelectedMarketId(id)}
                    />
                    <TradePanel
                      market={tradeMarket}
                      initialOutcome={selMatch && selMatch.market_types.some(mt => mt.markets.length >= 3) ? 'Yes' : (selectedOutcomeIdx === 0 ? 'Yes' : 'No')}
                      initialTab={buyMode}
                      bare
                    />
                  </div>
                </div>
              );
            })() : (
              <div style={{
                position: 'sticky', top: 68, borderRadius: 12, padding: '48px 16px',
                border: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  {isLoading ? 'Loading...' : 'Select a match to trade'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
