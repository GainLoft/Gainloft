'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { Market, EventGroup } from '@/lib/types';
import { getMarketBySlug, getEventGroupBySlug, getCurrentBtcLiveSlug, getCurrentLiveSlug } from '@/lib/dummyData';
import TradePanel from '@/components/trade/TradePanel';
import OutcomeDropdown from '@/components/trade/OutcomeDropdown';
import PriceChart from '@/components/market/PriceChart';
import CryptoLiveChart from '@/components/market/BtcLiveChart';
import Comments from '@/components/market/Comments';
import TopHolders from '@/components/market/TopHolders';
import OrderBook from '@/components/trade/OrderBook';
import TradeHistory from '@/components/trade/TradeHistory';
import OrderHistory from '@/components/trade/OrderHistory';

// ─────────────────────────────────────────────────────────────────────────────
// Scrolling number animation (odometer style)
// ─────────────────────────────────────────────────────────────────────────────

const ScrollingDigit = memo(function ScrollingDigit({ char, fontSize, color }: { char: string; fontSize: number; color: string }) {
  const [display, setDisplay] = useState(char);
  const [prev, setPrev] = useState(char);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('up');

  useEffect(() => {
    if (char !== display) {
      setPrev(display);
      setDisplay(char);
      // Determine scroll direction for numeric chars
      const n = parseInt(char);
      const p = parseInt(display);
      setDirection(!isNaN(n) && !isNaN(p) ? (n > p || (p === 9 && n === 0) ? 'up' : 'down') : 'up');
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  const isNum = /\d/.test(char);
  const w = isNum ? `${fontSize * 0.62}px` : (char === ',' ? `${fontSize * 0.3}px` : char === '.' ? `${fontSize * 0.3}px` : char === '$' ? `${fontSize * 0.62}px` : 'auto');

  return (
    <span style={{ display: 'inline-block', position: 'relative', overflow: 'hidden', height: `${fontSize * 1.2}px`, width: w, verticalAlign: 'bottom', lineHeight: `${fontSize * 1.2}px` }}>
      {animating && (
        <span className={direction === 'up' ? 'scroll-up-out' : 'scroll-down-out'} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, color }}>
          {prev}
        </span>
      )}
      <span className={animating ? (direction === 'up' ? 'scroll-up-in' : 'scroll-down-in') : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, color }}>
        {display}
      </span>
    </span>
  );
});

function ScrollingNumber({ value, fontSize, color }: { value: string; fontSize: number; color: string }) {
  const chars = value.split('');
  return (
    <span className="font-bold tabular-nums" style={{ display: 'inline-flex' }}>
      {chars.map((ch, i) => (
        <ScrollingDigit key={`${chars.length}-${i}`} char={ch} fontSize={fontSize} color={color} />
      ))}
    </span>
  );
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function formatVolumeExact(vol: number): string {
  return `$${Math.round(vol).toLocaleString('en-US')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules / Market Context section
// ─────────────────────────────────────────────────────────────────────────────

function RulesSection({ description, resolutionSource, endDateIso, createdAt }: {
  description: string | null;
  resolutionSource: string | null;
  endDateIso: string | null;
  createdAt: string;
}) {
  const [subTab, setSubTab] = useState<'rules' | 'context'>('rules');

  const openedDate = new Date(createdAt);
  const openedStr = openedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ', ' + openedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) + ' ET';

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {/* Sub-tabs: Rules | Market Context */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
          <button
            onClick={() => setSubTab('rules')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 15, fontWeight: subTab === 'rules' ? 700 : 500,
              color: subTab === 'rules' ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
          >
            Rules
          </button>
          <button
            onClick={() => setSubTab('context')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 15, fontWeight: subTab === 'context' ? 700 : 500,
              color: subTab === 'context' ? 'var(--brand-blue)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
          >
            Market Context
          </button>
        </div>

        {subTab === 'rules' && (
          <div>
            {/* Description / resolution rules */}
            {description ? (
              <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 16 }}>{description}</p>
            ) : (
              <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-muted)', marginBottom: 16 }}>
                This market resolves based on the official outcome as determined by the resolution source.
              </p>
            )}

            {resolutionSource && (
              <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 16 }}>
                The resolution source for this market will be {resolutionSource}.
              </p>
            )}

            {/* Market Opened */}
            <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 20 }}>
              <span style={{ fontWeight: 700 }}>Market Opened:</span>{' '}
              {openedStr}
            </p>

            {/* End date */}
            {endDateIso && (
              <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 20 }}>
                <span style={{ fontWeight: 700 }}>End Date:</span>{' '}
                {formatDateLong(endDateIso)}
              </p>
            )}

            {/* Resolver card */}
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'var(--bg-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--no-red)', letterSpacing: '0.05em',
              }}>
                UMA
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Resolver</div>
                <div style={{ fontSize: 13, color: 'var(--brand-blue)', fontFamily: 'monospace' }}>
                  0x2F5e3684c...
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === 'context' && (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 16 }}>
              This market allows traders to speculate on the outcome using prediction market mechanics.
              Each share pays $1.00 if the predicted outcome is correct, and $0.00 if incorrect.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Prices reflect the market&apos;s implied probability of each outcome. For example, a price of $0.75
              implies a 75% chance of that outcome occurring according to the collective wisdom of traders.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              Markets are resolved by an on-chain oracle system that verifies outcomes using credible reporting
              sources. Resolution is final and payouts are distributed automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Outcome Dropdown (inline style for chart section)
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Series Navigation — date tabs for related events (Past / Mar 18 / Apr 29...)
// ─────────────────────────────────────────────────────────────────────────────

function SeriesNav({ currentSlug, currentEndDate, currentClosed, related }: {
  currentSlug: string;
  currentEndDate: string | null;
  currentClosed?: boolean;
  related: RelatedEvent[];
}) {
  const [showPast, setShowPast] = useState(false);
  const router = useRouter();

  if (!related.length) return null;

  // Determine if current event is closed (from prop or endDate)
  const isClosed = currentClosed ?? (currentEndDate ? new Date(currentEndDate) < new Date() : false);

  // Build full list: current event + related, sorted by endDate ascending
  const allEvents = [
    { slug: currentSlug, endDate: currentEndDate || '', closed: isClosed, title: '', winning_outcome: null as string | null, isCurrent: true },
    ...related.map(r => ({ ...r, isCurrent: false })),
  ].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  // Deduplicate by date label — keep the first event per unique date
  // (current event always takes priority over duplicates on same date)
  const deduped = (() => {
    const seen = new Map<string, typeof allEvents[0]>();
    // Process current event first so it takes priority
    const sorted = [...allEvents].sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
    });
    for (const e of sorted) {
      const dateKey = new Date(e.endDate).toISOString().slice(0, 10); // YYYY-MM-DD
      if (!seen.has(dateKey)) {
        seen.set(dateKey, e);
      }
    }
    return Array.from(seen.values()).sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  })();

  const now = new Date();
  const pastEvents = deduped.filter(e => e.closed || new Date(e.endDate) < now);
  const upcomingEvents = deduped.filter(e => !e.closed && new Date(e.endDate) >= now);

  const fmtTabDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  const fmtDropdownDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <div style={{ marginBottom: 16, position: 'relative' }}>
      <div className="flex items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
        {/* Past dropdown */}
        {pastEvents.length > 0 && (
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center font-medium transition-colors"
            style={{
              padding: '7px 14px', borderRadius: 999, fontSize: 13,
              background: pastEvents.some(e => e.isCurrent) ? 'var(--text-primary)' : 'var(--bg-surface)',
              color: pastEvents.some(e => e.isCurrent) ? 'var(--bg)' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Past
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 4, transform: showPast ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              <path strokeLinecap="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}

        {/* Upcoming date tabs (including current) */}
        {upcomingEvents.map((e) => (
          <Link
            key={e.slug}
            href={`/event/${e.slug}`}
            className="font-medium transition-colors"
            style={{
              padding: '7px 14px', borderRadius: 999, fontSize: 13,
              background: e.isCurrent ? 'var(--text-primary)' : 'var(--bg-surface)',
              color: e.isCurrent ? 'var(--bg)' : 'var(--text-secondary)',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {fmtTabDate(e.endDate)}
          </Link>
        ))}
      </div>

      {/* Past dropdown panel */}
      {showPast && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setShowPast(false)}
          />
          <div
            className="absolute shadow-lg"
            style={{
              top: 'calc(100% + 6px)', left: 0, minWidth: 280, borderRadius: 12,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              zIndex: 100, maxHeight: 400, overflowY: 'auto',
            }}
          >
            {pastEvents.map((e, idx) => (
              <button
                key={e.slug}
                onClick={() => { setShowPast(false); if (!e.isCurrent) router.push(`/event/${e.slug}`); }}
                className="w-full flex items-center transition-colors"
                style={{
                  padding: '12px 16px', gap: 10, border: 'none', cursor: 'pointer',
                  background: e.isCurrent ? 'var(--bg-surface)' : 'transparent',
                  borderBottom: idx < pastEvents.length - 1 ? '1px solid var(--border-light)' : 'none',
                  textAlign: 'left',
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--bg-surface)'; }}
                onMouseLeave={(ev) => { if (!e.isCurrent) ev.currentTarget.style.background = 'transparent'; }}
              >
                {e.winning_outcome ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M5 13l4 4L19 7" stroke="var(--yes-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : e.closed ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                ) : null}
                <span style={{ fontSize: 14, fontWeight: e.isCurrent ? 600 : 400, color: 'var(--text-primary)' }}>
                  {fmtDropdownDate(e.endDate)}
                </span>
                {e.winning_outcome && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {e.winning_outcome}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-outcome Event Page (Polymarket clone)
// ─────────────────────────────────────────────────────────────────────────────

function MultiOutcomeEventPage({ event, relatedEvents = [] }: { event: EventGroup; relatedEvents?: RelatedEvent[] }) {
  type MultiTab = 'rules' | 'comments' | 'positions' | 'top_holders' | 'activity';
  const [activeTab, setActiveTab] = useState<MultiTab>('rules');
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [chartMarketId, setChartMarketId] = useState<string | null>(null);
  const [chartAnimating, setChartAnimating] = useState<string | null>(null); // tracks which chart is visually expanded
  const [closingChartId, setClosingChartId] = useState<string | null>(null);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [tradeOutcome, setTradeOutcome] = useState<'Yes' | 'No'>('Yes');
  const [showResolvedOutcomes, setShowResolvedOutcomes] = useState(false);
  const tradePanelRef = useRef<HTMLDivElement>(null);

  function handleBuyClick(marketId: string, outcome: 'Yes' | 'No') {
    setSelectedMarketId(marketId);
    setTradeOutcome(outcome);
    tradePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Collect Yes token IDs for live price fetching (No price = 1 - Yes bid)
  const yesTokenIds = event.markets
    .flatMap((m) => m.tokens.filter((t) => t.outcome === 'Yes').map((t) => t.token_id))
    .filter(Boolean);
  const { data: livePrices } = useSWR<Record<string, { bid: number; ask: number; mid: number }>>(
    yesTokenIds.length > 0 ? ['/api/polymarket/midpoints', ...yesTokenIds] : null,
    () => fetch('/api/polymarket/midpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yesTokenIds),
    }).then(r => r.json()),
    { refreshInterval: 10_000 }
  );

  // Build a lookup: tokenId → { bid, ask, mid } for use in rendering
  // price field on tokens = midpoint (for percentage display)
  const allMarkets = event.markets.map((m) => {
    if (!livePrices) return m;
    const yt = m.tokens.find((t) => t.outcome === 'Yes');
    const live = yt ? livePrices[yt.token_id] : undefined;
    if (!live) return m;
    const updatedTokens = m.tokens.map((t) => {
      if (t.outcome === 'Yes') return { ...t, price: live.mid || t.price };
      if (t.outcome === 'No') return { ...t, price: live.mid > 0 ? 1 - live.mid : t.price };
      return t;
    });
    return { ...m, tokens: updatedTokens };
  });

  // Split into active and resolved
  const activeMarkets = allMarkets.filter((m) => !m.resolved);
  const resolvedMarkets = allMarkets.filter((m) => m.resolved);
  const isEventResolved = activeMarkets.length === 0 && resolvedMarkets.length > 0;
  const sortedMarkets = activeMarkets.length > 0 ? activeMarkets : allMarkets;

  const selectedMarket = selectedMarketId
    ? event.markets.find((m) => m.id === selectedMarketId) ?? sortedMarkets[0]
    : sortedMarkets[0];

  const selectedYesToken = selectedMarket?.tokens.find((t) => t.outcome === 'Yes');

  // Trigger open animation on next frame after mount
  useEffect(() => {
    if (chartMarketId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setChartAnimating(chartMarketId);
        });
      });
    } else {
      setChartAnimating(null);
    }
  }, [chartMarketId]);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function fmtPct(raw: number): string {
    if (raw < 1 && raw > 0) return '<1';
    return raw.toFixed(1);
  }

  function fmtCents(raw: number): string {
    return raw.toFixed(1);
  }

  const TABS: { key: MultiTab; label: string; count?: number }[] = [
    { key: 'rules', label: 'Rules' },
    { key: 'comments', label: 'Comments' },
    { key: 'positions', label: 'Positions' },
    { key: 'top_holders', label: 'Top Holders' },
    { key: 'activity', label: 'Activity' },
  ];

  const FAQ_ITEMS = [
    {
      q: `What is the "${event.title}" prediction market?`,
      a: `This is a prediction market where traders can buy and sell shares based on the outcome of "${event.title}". Each share pays out $1.00 if the outcome is correct, and $0 if incorrect.`,
    },
    {
      q: 'How much trading activity has it generated?',
      a: `This market has generated ${formatVolumeExact(event.volume)} in total trading volume since it opened on ${formatDate(event.created_at)}.`,
    },
    {
      q: 'How do I trade on it?',
      a: 'Connect your wallet, deposit funds, then click "Yes" or "No" on any outcome. You can also place limit orders at specific prices.',
    },
    {
      q: 'What are the current odds?',
      a: `The leading outcome is "${sortedMarkets[0]?.question}" at ${((sortedMarkets[0]?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0) * 100).toFixed(1)}%. Prices update in real-time based on trading activity.`,
    },
    {
      q: 'How will it be resolved?',
      a: event.description || 'This market resolves based on the official outcome as determined by the resolution source.',
    },
    {
      q: 'Can I follow without trading?',
      a: 'Yes! You can bookmark this market to follow it and receive notifications about price changes and resolution without placing any trades.',
    },
    {
      q: 'Why are prediction market odds reliable?',
      a: 'Prediction markets aggregate information from thousands of traders who have financial incentives to be accurate. Research shows they often outperform polls and expert forecasts.',
    },
    {
      q: 'How do I start trading?',
      a: 'Connect your wallet using the button in the top right, deposit USDC, and you can start trading immediately. You can buy shares for as little as $1.',
    },
    {
      q: `What does ${((sortedMarkets[0]?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0) * 100).toFixed(0)}c mean?`,
      a: `A price of ${((sortedMarkets[0]?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0) * 100).toFixed(0)}c means the market estimates a ${((sortedMarkets[0]?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0) * 100).toFixed(0)}% probability of that outcome occurring. If correct, each share pays $1.00.`,
    },
    {
      q: 'When does the market close?',
      a: event.end_date_iso ? `This market closes on ${formatDateLong(event.end_date_iso)}.` : 'This market has no set end date and will close when the outcome is determined.',
    },
    {
      q: 'What are traders saying?',
      a: 'Check the Comments tab to see analysis and discussion from other traders about this market.',
    },
    {
      q: 'What is GainLoft?',
      a: 'GainLoft is a prediction market platform focused on events in Southeast Asia, allowing traders to bet on outcomes in politics, economics, sports, and more.',
    },
  ];

  // Popular markets in same category (from event's own markets for multi-outcome)
  const popularInCategory = event.markets
    .filter((m) => !m.resolved)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-[1200px] px-4" style={{ paddingTop: 20, paddingBottom: 48 }}>
      {/* Series navigation — past/future date tabs */}
      {relatedEvents.length > 0 && (
        <SeriesNav currentSlug={event.slug} currentEndDate={event.end_date_iso} currentClosed={event.markets.every(m => m.closed)} related={relatedEvents} />
      )}

      {/* Event header: image + title + meta + action buttons */}
      <div className="flex items-start" style={{ gap: 16, marginBottom: 12 }}>
        {event.image_url ? (
          <img src={event.image_url} alt="" className="flex-shrink-0 object-cover" loading="lazy" style={{ width: 80, height: 80, borderRadius: 12 }} />
        ) : (
          <div className="flex-shrink-0" style={{ width: 80, height: 80, borderRadius: 12, background: 'var(--bg-surface)' }} />
        )}
        <div className="min-w-0" style={{ paddingTop: 4, flex: 1 }}>
          <h1 className="font-bold" style={{ fontSize: 28, lineHeight: '34px', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            {event.title}
          </h1>
          <div className="flex items-center flex-wrap" style={{ gap: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            <span>{formatVolumeExact(event.volume)} Vol.</span>
            {event.end_date_iso && (
              <>
                <span style={{ color: 'var(--border)' }}>·</span>
                <span>{formatDate(event.end_date_iso)}</span>
              </>
            )}
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
          <button
            onClick={handleShare}
            className="flex items-center justify-center rounded-full transition-colors hover:opacity-70"
            style={{ width: 36, height: 36, color: copied ? 'var(--yes-green)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }}
            title="Share"
          >
            {copied ? (
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            )}
          </button>
          <button
            onClick={() => setBookmarked(!bookmarked)}
            className="flex items-center justify-center rounded-full transition-colors hover:opacity-70"
            style={{ width: 36, height: 36, color: bookmarked ? 'var(--brand-blue)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <svg width="15" height="15" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          </button>
          <button
            onClick={() => setAlertsOn(!alertsOn)}
            className="flex items-center justify-center rounded-full transition-colors hover:opacity-70"
            style={{ width: 36, height: 36, color: alertsOn ? 'var(--brand-blue)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }}
            title={alertsOn ? 'Alerts on' : 'Set alerts'}
          >
            <svg width="15" height="15" fill={alertsOn ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </button>
        </div>
      </div>

      {/* Resolved banner */}
      {isEventResolved && (
        <div className="flex items-center" style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: 'var(--green-bg)', border: '1px solid var(--yes-green)',
          gap: 10,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="var(--yes-green)" />
            <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--yes-green)' }}>Resolved</span>
            {event.end_date_iso && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {formatDate(event.end_date_iso)}
              </span>
            )}
          </div>
          {event.markets.find(m => m.winning_outcome)?.winning_outcome && (
            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {event.markets.find(m => m.winning_outcome === 'Yes')?.group_item_title ||
               event.markets.find(m => m.winning_outcome === 'Yes')?.question ||
               'Resolved'}
            </span>
          )}
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex" style={{ gap: 32 }}>
        {/* ── Left column ── */}
        <div className="flex-1 min-w-0">

          {/* ── Outcome rows (single container) ── */}
          <div className="overflow-hidden" style={{ borderRadius: 12, border: '1px solid var(--border)', marginBottom: 24 }}>
            {sortedMarkets.map((mkt, idx) => {
              const yesToken = mkt.tokens.find((t) => t.outcome === 'Yes');
              const noToken = mkt.tokens.find((t) => t.outcome === 'No');
              // Percentage display uses midpoint (already in token.price)
              const yesPriceRaw = yesToken ? yesToken.price * 100 : 0;
              // Button prices use ask (buy Yes) and 1-bid (buy No) from CLOB
              const origYt = event.markets.find((em) => em.id === mkt.id)?.tokens.find((t) => t.outcome === 'Yes');
              const live = origYt && livePrices ? livePrices[origYt.token_id] : undefined;
              const yesBtnPrice = live ? (live.ask || live.mid) * 100 : yesPriceRaw;
              const noBtnPrice = live ? (live.bid > 0 ? (1 - live.bid) * 100 : (1 - live.mid) * 100) : (noToken ? noToken.price * 100 : 100);
              const isSelected = mkt.id === selectedMarket?.id;
              const isChartOpen = chartMarketId === mkt.id;
              const label = mkt.group_item_title || mkt.question;
              const isWinner = mkt.resolved && mkt.winning_outcome === 'Yes';
              const isLoser = mkt.resolved && mkt.winning_outcome !== 'Yes';
              const resolvedPct = isWinner ? 100 : (isLoser ? 0 : null);
              return (
                <div key={mkt.id}>
                  <div
                    className="flex items-center justify-between transition-colors"
                    style={{
                      padding: '14px 16px',
                      borderBottom: idx < sortedMarkets.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isSelected ? 'var(--bg-surface)' : 'transparent',
                      cursor: 'pointer',
                      opacity: isLoser ? 0.5 : 1,
                    }}
                    onClick={() => {
                      setSelectedMarketId(mkt.id);
                      if (isChartOpen) {
                        // Start closing animation
                        setClosingChartId(mkt.id);
                        setChartMarketId(null);
                        if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
                        closingTimerRef.current = setTimeout(() => setClosingChartId(null), 350);
                      } else {
                        // Close any previous, open new
                        if (chartMarketId) {
                          setClosingChartId(chartMarketId);
                          if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
                          closingTimerRef.current = setTimeout(() => setClosingChartId(null), 350);
                        }
                        setChartMarketId(mkt.id);
                      }
                    }}
                  >
                    {/* Left: logo/checkmark + name + volume */}
                    <div className="flex items-center min-w-0" style={{ gap: 12, flex: 1 }}>
                      {isWinner ? (
                        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 32, height: 32 }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" fill="var(--yes-green)" />
                            <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      ) : isLoser ? (
                        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 32, height: 32 }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="var(--text-muted)" strokeWidth="1.5" />
                            <path d="M15 9l-6 6M9 9l6 6" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      ) : mkt.image_url ? (
                        <img
                          src={mkt.image_url}
                          alt=""
                          className="flex-shrink-0 object-contain"
                          style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-surface)' }}
                        />
                      ) : (
                        <div
                          className="flex-shrink-0 flex items-center justify-center"
                          style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-surface)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}
                        >
                          {label.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center" style={{ gap: 8 }}>
                          <span className="font-medium" style={{ fontSize: 15, color: isLoser ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom: 2 }}>
                            {label}
                          </span>
                          {isWinner && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 4, background: 'var(--green-bg)', color: 'var(--yes-green)' }}>
                              Winner
                            </span>
                          )}
                        </div>
                        <div className="flex items-center" style={{ gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                          <span>{formatVolumeExact(Number(mkt.volume))} Vol.</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: percentage + buy buttons (or resolved state) */}
                    <div className="flex items-center flex-shrink-0" style={{ gap: 16 }}>
                      {resolvedPct !== null ? (
                        /* Resolved: show final percentage only */
                        <span
                          className="font-bold tabular-nums"
                          style={{
                            fontSize: 24,
                            lineHeight: '28px',
                            color: isWinner ? 'var(--yes-green)' : 'var(--text-muted)',
                          }}
                        >
                          {resolvedPct}%
                        </span>
                      ) : (
                        /* Active: show percentage + payout + buy buttons */
                        <>
                          <div className="flex flex-col items-end" style={{ minWidth: 60 }}>
                            <span
                              className="font-bold tabular-nums"
                              style={{
                                fontSize: 24,
                                lineHeight: '28px',
                                color: yesPriceRaw >= 50 ? 'var(--yes-green)' : 'var(--text-primary)',
                              }}
                            >
                              {fmtPct(yesPriceRaw)}%
                            </span>
                            <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                              {yesToken && yesToken.price > 0 ? (1 / yesToken.price).toFixed(1) : '—'}x payout
                            </span>
                          </div>
                          <div className="flex" style={{ gap: 6 }}>
                            <button
                              className="font-semibold transition-colors hover:opacity-80 tabular-nums text-center"
                              style={{ padding: '7px 0', borderRadius: 8, fontSize: 13, background: 'var(--green-bg)', color: 'var(--yes-green)', minWidth: 96 }}
                              onClick={(e) => { e.stopPropagation(); handleBuyClick(mkt.id, 'Yes'); }}
                            >
                              Yes {fmtCents(yesBtnPrice)}¢
                            </button>
                            <button
                              className="font-semibold transition-colors hover:opacity-80 tabular-nums text-center"
                              style={{ padding: '7px 0', borderRadius: 8, fontSize: 13, background: 'var(--red-bg)', color: 'var(--no-red)', minWidth: 96 }}
                              onClick={(e) => { e.stopPropagation(); handleBuyClick(mkt.id, 'No'); }}
                            >
                              No {fmtCents(noBtnPrice)}¢
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline chart dropdown with animation */}
                  {(isChartOpen || closingChartId === mkt.id) && (
                    <div style={{
                      display: 'grid',
                      gridTemplateRows: chartAnimating === mkt.id ? '1fr' : '0fr',
                      transition: 'grid-template-rows 0.3s ease',
                    }}>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{
                          padding: '12px 16px 16px',
                          background: 'var(--bg-surface)',
                          opacity: chartAnimating === mkt.id ? 1 : 0,
                          transition: 'opacity 0.2s ease',
                        }}>
                          {yesToken && (
                            <PriceChart marketId={mkt.id} tokenId={yesToken.token_id} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          </div>

          {/* ── Resolved outcomes (separate section, only shown for partially resolved events) ── */}
          {!isEventResolved && resolvedMarkets.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={() => setShowResolvedOutcomes(!showResolvedOutcomes)}
                className="flex items-center transition-colors hover:opacity-80"
                style={{ gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', padding: '10px 0' }}
              >
                <svg
                  width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                  style={{ transform: showResolvedOutcomes ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                {showResolvedOutcomes ? 'Hide' : 'Show'} {resolvedMarkets.length} resolved
              </button>

              {showResolvedOutcomes && (
                <div className="overflow-hidden" style={{ borderRadius: 12, border: '1px solid var(--border)', marginTop: 8 }}>
                  {resolvedMarkets.map((mkt, idx) => {
                    const label = mkt.group_item_title || mkt.question;
                    const winner = mkt.winning_outcome;
                    return (
                      <div
                        key={mkt.id}
                        className="flex items-center justify-between"
                        style={{
                          padding: '12px 16px',
                          borderBottom: idx < resolvedMarkets.length - 1 ? '1px solid var(--border)' : 'none',
                          opacity: 0.7,
                        }}
                      >
                        <div className="flex items-center min-w-0" style={{ gap: 12, flex: 1 }}>
                          <div
                            className="flex-shrink-0 flex items-center justify-center"
                            style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-surface)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}
                          >
                            {label.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center" style={{ gap: 6 }}>
                              <span className="font-medium" style={{ fontSize: 15, color: 'var(--text-primary)' }}>{label}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: winner === 'Yes' ? 'var(--green-bg)' : 'var(--red-bg)', color: winner === 'Yes' ? 'var(--yes-green)' : 'var(--no-red)' }}>
                                {winner}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {formatVolumeExact(Number(mkt.volume))} Vol.
                            </div>
                          </div>
                        </div>
                        <span
                          className="font-bold tabular-nums flex-shrink-0"
                          style={{ fontSize: 20, color: winner === 'Yes' ? 'var(--yes-green)' : 'var(--no-red)' }}
                        >
                          {winner === 'Yes' ? '100' : '0'}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


          {/* ── Section tabs ── */}
          <div className="flex items-center" style={{ borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative transition-colors"
                style={{
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: activeTab === tab.key ? 600 : 500,
                  color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute left-4 right-4" style={{ bottom: 0, height: 2, borderRadius: 1, background: 'var(--brand-blue)' }} />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'rules' && (
            <RulesSection
              description={event.description}
              resolutionSource={selectedMarket.resolution_source}
              endDateIso={event.end_date_iso}
              createdAt={event.created_at}
            />
          )}

          {activeTab === 'comments' && (
            <div style={{ marginBottom: 32 }}><Comments marketId={selectedMarket.id} /></div>
          )}

          {activeTab === 'positions' && (
            <div style={{ marginBottom: 32 }}>
              <div className="text-center" style={{ padding: '40px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>No positions yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Connect your wallet and trade to see your positions here.</p>
              </div>
            </div>
          )}

          {activeTab === 'top_holders' && (
            <div style={{ marginBottom: 32 }}><TopHolders marketId={selectedMarket.id} /></div>
          )}

          {activeTab === 'activity' && (
            <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TradeHistory marketId={selectedMarket.id} />
              <OrderHistory marketId={selectedMarket.id} />
            </div>
          )}

          {/* ── FAQ Accordion ── */}
          <div style={{ marginTop: 16, marginBottom: 32 }}>
            <h3 className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 12 }}>
              FAQ
            </h3>
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {FAQ_ITEMS.map((item, idx) => (
                <div key={idx} style={{ borderBottom: idx < FAQ_ITEMS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <button
                    onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                    className="flex items-center justify-between w-full text-left transition-colors hover:opacity-80"
                    style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}
                  >
                    <span>{item.q}</span>
                    <svg
                      width="16" height="16" fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24" strokeWidth={2}
                      style={{ flexShrink: 0, marginLeft: 12, transform: faqOpen === idx ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {faqOpen === idx && (
                    <div style={{ padding: '0 16px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Popular markets in category ── */}
          {popularInCategory.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h3 className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 12 }}>
                Popular {event.category} markets
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {popularInCategory.map((m) => {
                  const yT = m.tokens.find((t) => t.outcome === 'Yes');
                  const pct = yT ? Math.round(yT.price * 100) : 50;
                  return (
                    <Link
                      key={m.id}
                      href={`/event/${m.slug}`}
                      className="flex items-center justify-between transition-colors hover:opacity-80"
                      style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center min-w-0" style={{ gap: 12 }}>
                        {m.image_url && (
                          <img src={m.image_url} alt="" className="flex-shrink-0 object-cover" loading="lazy" style={{ width: 32, height: 32, borderRadius: 8 }} />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{m.question}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatVolume(m.volume)} Vol.</div>
                        </div>
                      </div>
                      <span className="font-bold tabular-nums flex-shrink-0" style={{ fontSize: 16, color: 'var(--yes-green)', marginLeft: 12 }}>{pct}%</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="hidden lg:block flex-shrink-0" style={{ width: 340 }}>
          <div ref={tradePanelRef} className="sticky" style={{ top: 76, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isEventResolved ? (
              /* Resolved: show outcome summary instead of trade panel */
              <div className="rounded-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflow: 'hidden', padding: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Outcome</div>
                <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="var(--yes-green)" />
                    <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {sortedMarkets.find(m => m.winning_outcome === 'Yes')?.group_item_title ||
                     sortedMarkets.find(m => m.winning_outcome === 'Yes')?.question ||
                     'Resolved'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  This market has been resolved. The final result has been determined and the market is no longer open for trading.
                </div>
                {event.end_date_iso && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
                    Resolved: {formatDateLong(event.end_date_iso)}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Combined outcome selector + trade panel */}
                <div className="rounded-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <OutcomeDropdown
                    markets={sortedMarkets}
                    selectedId={selectedMarket.id}
                    onSelect={(id) => setSelectedMarketId(id)}
                  />
                  <TradePanel market={selectedMarket} initialOutcome={tradeOutcome} bare />
                </div>

                {/* Order Book */}
                {selectedYesToken && (
                  <OrderBook marketId={selectedMarket.id} tokenId={selectedYesToken.token_id} />
                )}
              </>
            )}

            {/* Market info */}
            <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Volume', value: formatVolumeExact(event.volume) },
                  { label: 'Liquidity', value: formatVolume(event.liquidity) },
                  ...(event.end_date_iso ? [{ label: 'End Date', value: formatDate(event.end_date_iso) }] : []),
                  { label: 'Market Opened', value: formatDate(event.created_at) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Binary Market Page (Yes/No)
// ─────────────────────────────────────────────────────────────────────────────

type SingleTab = 'rules' | 'comments' | 'positions' | 'top_holders' | 'activity';

function SingleMarketPage({ market, relatedEvents = [] }: { market: Market; relatedEvents?: RelatedEvent[] }) {
  const [activeTab, setActiveTab] = useState<SingleTab>('rules');
  const [copied, setCopied] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [tradeOutcome, setTradeOutcome] = useState<'Yes' | 'No'>('Yes');
  const tradePanelRef = useRef<HTMLDivElement>(null);

  const isResolved = market.resolved;
  const winningOutcome = market.winning_outcome;

  // Live price fetching from CLOB (Yes token only — No = 1 - Yes bid)
  const yesToken = market.tokens.find((t) => t.outcome === 'Yes');
  const yesTokenId = yesToken?.token_id;
  const { data: livePrices } = useSWR<Record<string, { bid: number; ask: number; mid: number }>>(
    !isResolved && yesTokenId ? ['/api/polymarket/midpoints', yesTokenId] : null,
    () => fetch('/api/polymarket/midpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([yesTokenId]),
    }).then(r => r.json()),
    { refreshInterval: 10_000 }
  );

  const live = yesTokenId ? livePrices?.[yesTokenId] : undefined;
  // Percentage display uses midpoint
  const yesPct = isResolved ? (winningOutcome === 'Yes' ? 100 : 0) : Math.round((live?.mid ?? yesToken?.price ?? 0.5) * 100);
  const noPct = isResolved ? (winningOutcome === 'No' ? 100 : 0) : (100 - yesPct);
  // Button prices use ask (buy Yes) and 1-bid (buy No)
  const yesBtnPct = live ? Math.round((live.ask || live.mid) * 100) : yesPct;
  const noBtnPct = live ? Math.round((live.bid > 0 ? (1 - live.bid) : (1 - live.mid)) * 100) : noPct;

  const resolvedRelated = market.related_markets?.filter((rm) => rm.resolved) ?? [];
  const activeRelated = market.related_markets?.filter((rm) => !rm.resolved) ?? [];

  function handleBuyClick(outcome: 'Yes' | 'No') {
    setTradeOutcome(outcome);
    tradePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Popular markets in same category — will be populated from Polymarket data
  const popularInCategory: Market[] = [];

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const TABS: { key: SingleTab; label: string }[] = [
    { key: 'rules', label: 'Rules' },
    { key: 'comments', label: 'Comments' },
    { key: 'positions', label: 'Positions' },
    { key: 'top_holders', label: 'Top Holders' },
    { key: 'activity', label: 'Activity' },
  ];

  const FAQ_ITEMS = [
    {
      q: `What is the "${market.question}" prediction market?`,
      a: `This is a prediction market where traders can buy and sell shares based on the outcome of "${market.question}". Each share pays out $1.00 if the outcome is correct, and $0 if incorrect.`,
    },
    {
      q: 'How much trading activity has it generated?',
      a: `This market has generated ${formatVolumeExact(market.volume)} in total trading volume since it opened on ${formatDate(market.created_at)}.`,
    },
    {
      q: 'How do I trade on it?',
      a: 'Connect your wallet, deposit funds, then click "Yes" or "No" on any outcome. You can also place limit orders at specific prices.',
    },
    {
      q: 'What are the current odds?',
      a: `The current probability is ${yesPct}% Yes / ${noPct}% No. Prices update in real-time based on trading activity.`,
    },
    {
      q: 'How will it be resolved?',
      a: market.description || 'This market resolves based on the official outcome as determined by the resolution source.',
    },
    {
      q: 'Can I follow without trading?',
      a: 'Yes! You can bookmark this market to follow it and receive notifications about price changes and resolution without placing any trades.',
    },
    {
      q: 'Why are prediction market odds reliable?',
      a: 'Prediction markets aggregate information from thousands of traders who have financial incentives to be accurate. Research shows they often outperform polls and expert forecasts.',
    },
    {
      q: 'How do I start trading?',
      a: 'Connect your wallet using the button in the top right, deposit USDC, and you can start trading immediately. You can buy shares for as little as $1.',
    },
    {
      q: `What does ${yesPct}c mean?`,
      a: `A price of ${yesPct}c means the market estimates a ${yesPct}% probability of that outcome occurring. If correct, each share pays $1.00.`,
    },
    {
      q: 'When does the market close?',
      a: market.end_date_iso ? `This market closes on ${formatDateLong(market.end_date_iso)}.` : 'This market has no set end date and will close when the outcome is determined.',
    },
    {
      q: 'What are traders saying?',
      a: 'Check the Comments tab to see analysis and discussion from other traders about this market.',
    },
    {
      q: 'What is GainLoft?',
      a: 'GainLoft is a prediction market platform focused on events in Southeast Asia, allowing traders to bet on outcomes in politics, economics, sports, and more.',
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4" style={{ paddingTop: 20, paddingBottom: 48 }}>
      {/* Series navigation — past/future date tabs */}
      {relatedEvents.length > 0 && (
        <SeriesNav currentSlug={market.slug} currentEndDate={market.end_date_iso} currentClosed={market.closed} related={relatedEvents} />
      )}

      {/* Market header: image + title + meta + action buttons */}
      <div className="flex items-start" style={{ gap: 16, marginBottom: 12 }}>
        {market.image_url ? (
          <img src={market.image_url} alt="" className="flex-shrink-0 object-cover" loading="lazy" style={{ width: 80, height: 80, borderRadius: 12 }} />
        ) : (
          <div className="flex-shrink-0" style={{ width: 80, height: 80, borderRadius: 12, background: 'var(--bg-surface)' }} />
        )}
        <div className="min-w-0" style={{ paddingTop: 4, flex: 1 }}>
          <h1 className="font-bold" style={{ fontSize: 28, lineHeight: '34px', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            {market.question}
          </h1>
          <div className="flex items-center flex-wrap" style={{ gap: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            <span>{formatVolumeExact(market.volume)} Vol.</span>
            {market.end_date_iso && (
              <>
                <span style={{ color: 'var(--border)' }}>·</span>
                <span>{formatDate(market.end_date_iso)}</span>
              </>
            )}
            <span style={{ color: 'var(--border)' }}>·</span>
            <span>{formatVolume(Number(market.liquidity))} Liquidity</span>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
          <button
            onClick={handleShare}
            className="flex items-center justify-center rounded-full transition-colors hover:opacity-70"
            style={{ width: 36, height: 36, color: copied ? 'var(--yes-green)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }}
            title="Share"
          >
            {copied ? (
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            )}
          </button>
          <button
            onClick={() => setBookmarked(!bookmarked)}
            className="flex items-center justify-center rounded-full transition-colors hover:opacity-70"
            style={{ width: 36, height: 36, color: bookmarked ? 'var(--brand-blue)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <svg width="15" height="15" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          </button>
          <button
            onClick={() => setAlertsOn(!alertsOn)}
            className="flex items-center justify-center rounded-full transition-colors hover:opacity-70"
            style={{ width: 36, height: 36, color: alertsOn ? 'var(--brand-blue)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }}
            title={alertsOn ? 'Alerts on' : 'Set alerts'}
          >
            <svg width="15" height="15" fill={alertsOn ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </button>
        </div>
      </div>

      {/* Resolved banner */}
      {isResolved && (
        <div
          className="flex items-center"
          style={{
            gap: 10, padding: '12px 16px', borderRadius: 12, marginBottom: 12,
            background: winningOutcome === 'Yes' ? 'var(--green-bg)' : 'var(--red-bg)',
            border: `1px solid ${winningOutcome === 'Yes' ? 'var(--yes-green)' : 'var(--no-red)'}`,
          }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 28, height: 28, borderRadius: '50%', background: winningOutcome === 'Yes' ? 'var(--yes-green)' : 'var(--no-red)' }}
          >
            <svg width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <span className="font-semibold" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
              Resolved: {winningOutcome}
            </span>
            {market.resolved_at && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {formatDate(market.resolved_at)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex" style={{ gap: 32 }}>
        {/* ── Left column ── */}
        <div className="flex-1 min-w-0">

          {/* Outcome rows */}
          <div className="overflow-hidden" style={{ borderRadius: 12, border: '1px solid var(--border)', marginBottom: 24 }}>
            {market.tokens.map((token, idx) => {
              const isYes = token.outcome === 'Yes';
              // Percentage display uses midpoint
              const pct = isResolved ? (token.outcome === winningOutcome ? 100 : 0) : (isYes ? yesPct : noPct);
              const isWinner = isResolved && token.outcome === winningOutcome;
              const isLoser = isResolved && token.outcome !== winningOutcome;
              return (
                <div key={token.token_id} className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: idx < market.tokens.length - 1 ? '1px solid var(--border)' : 'none', opacity: isLoser ? 0.5 : 1 }}>
                  <div className="flex items-center" style={{ gap: 12 }}>
                    {isWinner ? (
                      <div className="flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--yes-green)' }}>
                        <svg width="12" height="12" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    ) : (
                      <div style={{ width: isResolved ? 20 : 10, height: isResolved ? 20 : 10, borderRadius: '50%', background: isResolved ? 'var(--bg-surface)' : (isYes ? 'var(--yes-green)' : 'var(--no-red)'), flexShrink: 0, border: isResolved ? '2px solid var(--border)' : 'none' }} />
                    )}
                    <span className="font-medium" style={{ fontSize: 15, color: 'var(--text-primary)' }}>{token.outcome}</span>
                    <span className="font-bold tabular-nums" style={{ fontSize: 24, color: isWinner ? 'var(--yes-green)' : (isLoser ? 'var(--text-muted)' : (isYes ? 'var(--yes-green)' : 'var(--no-red)')) }}>{pct}%</span>
                    {!isResolved && (
                      <div className="hidden sm:block" style={{ width: 100, height: 6, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: isYes ? 'var(--yes-green)' : 'var(--no-red)' }} />
                      </div>
                    )}
                  </div>
                  {!isResolved && (
                    <div className="flex" style={{ gap: 6 }}>
                      <button onClick={() => handleBuyClick('Yes')} className="font-semibold transition-colors hover:opacity-80 tabular-nums text-center" style={{ padding: '7px 0', borderRadius: 8, fontSize: 13, background: 'var(--green-bg)', color: 'var(--yes-green)', minWidth: 96 }}>Yes {yesBtnPct}¢</button>
                      <button onClick={() => handleBuyClick('No')} className="font-semibold transition-colors hover:opacity-80 tabular-nums text-center" style={{ padding: '7px 0', borderRadius: 8, fontSize: 13, background: 'var(--red-bg)', color: 'var(--no-red)', minWidth: 96 }}>No {noBtnPct}¢</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Related markets date pills (if any) */}
          {(activeRelated.length > 0 || resolvedRelated.length > 0) && (
            <div style={{ marginBottom: 24 }}>
              <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: resolvedRelated.length > 0 ? 8 : 0 }}>
                {activeRelated.map((rm) => {
                  const yT = rm.tokens?.find((t) => t.outcome === 'Yes');
                  return (
                    <Link
                      key={rm.id}
                      href={`/event/${rm.slug}`}
                      className="flex items-center transition-colors hover:opacity-80"
                      style={{
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 9999,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {rm.question}
                      {yT && <span className="tabular-nums" style={{ color: 'var(--yes-green)' }}>{Math.round(yT.price * 100)}%</span>}
                    </Link>
                  );
                })}
              </div>

              {/* Show/Hide resolved */}
              {resolvedRelated.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowResolved(!showResolved)}
                    className="flex items-center transition-colors hover:opacity-80"
                    style={{ gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', padding: '8px 0' }}
                  >
                    <svg
                      width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                      style={{ transform: showResolved ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                    {showResolved ? 'Hide' : 'Show'} {resolvedRelated.length} resolved
                  </button>
                  {showResolved && (
                    <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 4 }}>
                      {resolvedRelated.map((rm) => (
                        <Link
                          key={rm.id}
                          href={`/event/${rm.slug}`}
                          className="flex items-center transition-colors hover:opacity-80"
                          style={{
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 9999,
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'var(--text-secondary)',
                            opacity: 0.7,
                          }}
                        >
                          {rm.question}
                          <span style={{ color: rm.winning_outcome === 'Yes' ? 'var(--yes-green)' : 'var(--no-red)' }}>
                            {rm.winning_outcome}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Price chart */}
          {yesToken && (
            <div style={{ marginBottom: 32 }}>
              <PriceChart marketId={market.id} tokenId={yesToken.token_id} />
            </div>
          )}

          {/* Section tabs */}
          <div className="flex items-center" style={{ borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative transition-colors"
                style={{
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: activeTab === tab.key ? 600 : 500,
                  color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute left-4 right-4" style={{ bottom: 0, height: 2, borderRadius: 1, background: 'var(--brand-blue)' }} />
                )}
              </button>
            ))}
          </div>

          {activeTab === 'rules' && (
            <RulesSection
              description={market.description}
              resolutionSource={market.resolution_source}
              endDateIso={market.end_date_iso}
              createdAt={market.created_at}
            />
          )}

          {activeTab === 'comments' && <div style={{ marginBottom: 32 }}><Comments marketId={market.id} /></div>}

          {activeTab === 'positions' && (
            <div style={{ marginBottom: 32 }}>
              <div className="text-center" style={{ padding: '40px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>No positions yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Connect your wallet and trade to see your positions here.</p>
              </div>
            </div>
          )}

          {activeTab === 'top_holders' && <div style={{ marginBottom: 32 }}><TopHolders marketId={market.id} /></div>}

          {activeTab === 'activity' && (
            <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TradeHistory marketId={market.id} />
              <OrderHistory marketId={market.id} />
            </div>
          )}

          {/* ── FAQ Accordion ── */}
          <div style={{ marginTop: 16, marginBottom: 32 }}>
            <h3 className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 12 }}>
              FAQ
            </h3>
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {FAQ_ITEMS.map((item, idx) => (
                <div key={idx} style={{ borderBottom: idx < FAQ_ITEMS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <button
                    onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                    className="flex items-center justify-between w-full text-left transition-colors hover:opacity-80"
                    style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}
                  >
                    <span>{item.q}</span>
                    <svg
                      width="16" height="16" fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24" strokeWidth={2}
                      style={{ flexShrink: 0, marginLeft: 12, transform: faqOpen === idx ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {faqOpen === idx && (
                    <div style={{ padding: '0 16px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Popular markets in category ── */}
          {popularInCategory.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h3 className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 12 }}>
                Popular {market.category} markets
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {popularInCategory.map((m) => {
                  const yT = m.tokens.find((t) => t.outcome === 'Yes');
                  const pct = yT ? Math.round(yT.price * 100) : 50;
                  return (
                    <Link
                      key={m.id}
                      href={`/event/${m.slug}`}
                      className="flex items-center justify-between transition-colors hover:opacity-80"
                      style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center min-w-0" style={{ gap: 12 }}>
                        {m.image_url && (
                          <img src={m.image_url} alt="" className="flex-shrink-0 object-cover" loading="lazy" style={{ width: 32, height: 32, borderRadius: 8 }} />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{m.question}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatVolume(m.volume)} Vol.</div>
                        </div>
                      </div>
                      <span className="font-bold tabular-nums flex-shrink-0" style={{ fontSize: 16, color: 'var(--yes-green)', marginLeft: 12 }}>{pct}%</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="hidden lg:block flex-shrink-0" style={{ width: 340 }}>
          <div ref={tradePanelRef} className="sticky" style={{ top: 76, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isResolved ? (
              <div style={{ padding: 24, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--green-bg)', margin: '0 auto 16px' }}>
                  <svg width="24" height="24" fill="none" stroke="var(--yes-green)" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="font-bold" style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>Market Resolved</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>Winning outcome: <span className="font-semibold" style={{ color: 'var(--yes-green)' }}>{winningOutcome}</span></p>
                {market.resolved_at && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Resolved on {formatDate(market.resolved_at)}</p>}
              </div>
            ) : (
              <>
                <TradePanel market={market} initialOutcome={tradeOutcome} />
                {yesToken && <OrderBook marketId={market.id} tokenId={yesToken.token_id} />}
                <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <h3 className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 16 }}>What can you win?</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="flex items-start" style={{ gap: 12 }}>
                      <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green-bg)' }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4.5 9l3.5 3.5 5.5-6.5" stroke="var(--yes-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      <div>
                        <p className="font-medium" style={{ fontSize: 14, color: 'var(--text-primary)' }}>Yes at {yesBtnPct}¢ · <span className="tabular-nums" style={{ color: 'var(--yes-green)' }}>{yesBtnPct > 0 ? (100 / yesBtnPct).toFixed(2) : '0'}x</span></p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>Win $1.00 per share if Yes. <span className="font-semibold" style={{ color: 'var(--yes-green)' }}>{yesBtnPct > 0 ? Math.round((1 / (yesBtnPct / 100) - 1) * 100) : 0}% return</span></p>
                      </div>
                    </div>
                    <div className="flex items-start" style={{ gap: 12 }}>
                      <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--red-bg)' }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 5l8 8M13 5l-8 8" stroke="var(--no-red)" strokeWidth="2" strokeLinecap="round"/></svg>
                      </div>
                      <div>
                        <p className="font-medium" style={{ fontSize: 14, color: 'var(--text-primary)' }}>No at {noBtnPct}¢ · <span className="tabular-nums" style={{ color: 'var(--no-red)' }}>{noBtnPct > 0 ? (100 / noBtnPct).toFixed(2) : '0'}x</span></p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>Win $1.00 per share if No. <span className="font-semibold" style={{ color: 'var(--yes-green)' }}>{noBtnPct > 0 ? Math.round((1 / (noBtnPct / 100) - 1) * 100) : 0}% return</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Volume', value: formatVolumeExact(market.volume) },
                  { label: 'Liquidity', value: formatVolume(Number(market.liquidity)) },
                  ...(market.end_date_iso ? [{ label: 'End Date', value: formatDate(market.end_date_iso) }] : []),
                  ...(isResolved && market.resolved_at ? [{ label: 'Resolved', value: formatDate(market.resolved_at) }] : []),
                  ...(isResolved && winningOutcome ? [{ label: 'Outcome', value: winningOutcome }] : []),
                  { label: 'Market Opened', value: formatDate(market.created_at) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Market Page (Crypto Up/Down 5-minute windows — BTC, ETH, SOL, XRP, DOGE)
// ─────────────────────────────────────────────────────────────────────────────

// Map slug prefix → Binance symbol
const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  sol: 'SOLUSDT',
  xrp: 'XRPUSDT',
  doge: 'DOGEUSDT',
};

// Map long crypto names to tickers (for hourly/4h event slugs like "bitcoin-up-or-down-...")
const CRYPTO_NAME_TO_TICKER: Record<string, string> = {
  bitcoin: 'btc', ethereum: 'eth', solana: 'sol', xrp: 'xrp', dogecoin: 'doge',
};

/** Detect if an EventGroup is a crypto Up/Down series (any interval) */
function isCryptoUpDownEvent(event: EventGroup): boolean {
  const title = event.title.toLowerCase();
  if (!title.includes('up or down') && !title.includes('up-or-down')) return false;
  const cryptoNames = ['bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'xrp', 'dogecoin', 'doge'];
  return cryptoNames.some(name => title.startsWith(name));
}

function detectCryptoAsset(slug: string): { binanceSymbol: string; slugPrefix: string; assetName: string; isTimestampBased: boolean } {
  // Short form: btc-updown-5m-1773070800
  const shortMatch = slug.match(/^(btc|eth|sol|xrp|doge)-updown-(\d+m?)/);
  if (shortMatch) {
    const ticker = shortMatch[1];
    const interval = shortMatch[2];
    return {
      binanceSymbol: CRYPTO_SYMBOL_MAP[ticker] || 'BTCUSDT',
      slugPrefix: `${ticker}-updown-${interval}`,
      assetName: ticker.toUpperCase(),
      isTimestampBased: true,
    };
  }

  // Long form: bitcoin-up-or-down-march-9-7am-et (hourly/4h events)
  const longMatch = slug.match(/^(bitcoin|ethereum|solana|xrp|dogecoin)-up-or-down/);
  if (longMatch) {
    const ticker = CRYPTO_NAME_TO_TICKER[longMatch[1]] || 'btc';
    return {
      binanceSymbol: CRYPTO_SYMBOL_MAP[ticker] || 'BTCUSDT',
      slugPrefix: '',
      assetName: ticker.toUpperCase(),
      isTimestampBased: false,
    };
  }

  return { binanceSymbol: 'BTCUSDT', slugPrefix: 'btc-updown-5m', assetName: 'BTC', isTimestampBased: true };
}

function LiveMarketPage({ event }: { event: EventGroup }) {
  type LiveTab = 'order_book' | 'comments' | 'positions' | 'top_holders' | 'activity';
  const router = useRouter();

  const { binanceSymbol, slugPrefix, assetName, isTimestampBased } = detectCryptoAsset(event.slug);

  const [activeTab, setActiveTab] = useState<LiveTab>('order_book');
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [tradeOutcome, setTradeOutcome] = useState<'Yes' | 'No'>('Yes');
  const [countdown, setCountdown] = useState('');
  const [cryptoPrice, setCryptoPrice] = useState<number | null>(null);
  const [refPrice, setRefPrice] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  const [resolvedOutcome, setResolvedOutcome] = useState<'Up' | 'Down' | null>(null);
  const [autoNavCountdown, setAutoNavCountdown] = useState(5);
  const [showAllPills, setShowAllPills] = useState(false);
  const tradePanelRef = useRef<HTMLDivElement>(null);
  const cryptoPriceRef = useRef(cryptoPrice);
  cryptoPriceRef.current = cryptoPrice;


  // Handle both dual-market (separate Up/Down markets) and single-market (Up=Yes, Down=No) events
  const isSingleMarket = event.markets.length === 1;
  const upMarket = event.markets.find((m) => m.question === 'Up') ?? event.markets[0];
  const downMarket = event.markets.find((m) => m.question === 'Down') ?? event.markets[1] ?? event.markets[0];

  // Live prices — poll CLOB API every 2s for real-time odds
  const [liveUpPrice, setLiveUpPrice] = useState<number | null>(null);
  const [liveDownPrice, setLiveDownPrice] = useState<number | null>(null);

  const yesTokenId = upMarket?.tokens.find((t) => t.outcome === 'Yes')?.token_id;

  useEffect(() => {
    if (!yesTokenId || upMarket?.resolved) return;
    let mounted = true;

    async function fetchPrices() {
      try {
        const res = await fetch(`https://clob.polymarket.com/price?token_id=${yesTokenId}&side=buy`);
        if (!res.ok || !mounted) return;
        const data = await res.json();
        const price = Number(data.price);
        if (!isNaN(price) && mounted) {
          setLiveUpPrice(price);
          setLiveDownPrice(1 - price);
        }
      } catch { /* silent */ }
    }

    fetchPrices();
    const iv = setInterval(fetchPrices, 2000);
    return () => { mounted = false; clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yesTokenId]);

  const initialUpPrice = isSingleMarket
    ? (upMarket?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0.5)
    : (upMarket?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0.5);
  const initialDownPrice = isSingleMarket
    ? (upMarket?.tokens.find((t) => t.outcome === 'No')?.price ?? 0.5)
    : (downMarket?.tokens.find((t) => t.outcome === 'Yes')?.price ?? 0.5);

  const upPrice = liveUpPrice ?? initialUpPrice;
  const downPrice = liveDownPrice ?? initialDownPrice;

  // Inject live CLOB prices into market tokens so TradePanel reflects real-time odds
  const selectedMarket = upMarket ? {
    ...upMarket,
    tokens: upMarket.tokens.map((t) => {
      if (t.outcome === 'Yes' && liveUpPrice !== null) return { ...t, price: liveUpPrice };
      if (t.outcome === 'No' && liveDownPrice !== null) return { ...t, price: liveDownPrice };
      return t;
    }),
  } : upMarket;
  const selectedYesToken = selectedMarket?.tokens.find((t) => t.outcome === (tradeOutcome === 'Yes' ? 'Yes' : 'No'));

  // Detect if this is a past (already resolved) window from data
  const isPastResolved = upMarket?.resolved === true;
  const pastWinner: 'Up' | 'Down' | null = isPastResolved
    ? (upMarket?.winning_outcome === 'Yes' ? 'Up' : 'Down')
    : null;

  // For display: past windows show 100/0, live shows actual prices
  const displayUpPct = isPastResolved
    ? (pastWinner === 'Up' ? '100.0' : '0.0')
    : (upPrice * 100).toFixed(1);
  const displayDownPct = isPastResolved
    ? (pastWinner === 'Down' ? '100.0' : '0.0')
    : (downPrice * 100).toFixed(1);

  // Effective resolved state: either from data (past) or from live resolution
  const isResolved = isPastResolved || resolved;
  const winnerOutcome = isPastResolved ? pastWinner : resolvedOutcome;

  // Countdown timer + auto-resolution (only for live/current windows)
  useEffect(() => {
    if (isPastResolved) return;

    function update() {
      if (!event.end_date_iso) return;
      const diff = new Date(event.end_date_iso).getTime() - Date.now();
      if (diff <= 0) {
        if (!resolved) {
          const ref = refPrice ?? event.reference_price ?? 0;
          const current = cryptoPriceRef.current ?? ref;
          const winner = current >= ref ? 'Up' : 'Down';
          setResolvedOutcome(winner);
          setResolved(true);
          setCountdown('Resolved');
        }
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    }
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.end_date_iso, isPastResolved]);

  // Auto-navigate to next window after resolution
  useEffect(() => {
    if (!resolved) return;
    let nav = 5;
    setAutoNavCountdown(nav);
    const iv = setInterval(() => {
      nav--;
      setAutoNavCountdown(nav);
      if (nav <= 0) {
        clearInterval(iv);
        if (isTimestampBased) {
          router.push(`/event/${getCurrentLiveSlug(slugPrefix)}`);
        } else {
          // For non-timestamp slugs (hourly/4h), find next upcoming from time_windows
          const next = event.time_windows?.find(tw => tw.status === 'upcoming');
          if (next) router.push(`/event/${next.slug}`);
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [resolved, router]);

  // Real crypto price from Binance (only for live, non-resolved)
  useEffect(() => {
    if (resolved || isPastResolved) return;
    let mounted = true;
    async function fetchPrice() {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
        const data = await res.json();
        const price = parseFloat(data.price);
        if (mounted && !isNaN(price)) {
          setCryptoPrice(price);
          setRefPrice((prev) => prev ?? price);
        }
      } catch { /* silent */ }
    }
    fetchPrice();
    const iv = setInterval(fetchPrice, 3000);
    return () => { mounted = false; clearInterval(iv); };
  }, [resolved, isPastResolved, binanceSymbol]);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleBuyClick(outcome: 'Yes' | 'No') {
    if (isResolved) return;
    setTradeOutcome(outcome);
  }

  function handleGoToLive() {
    if (isTimestampBased) {
      router.push(`/event/${getCurrentLiveSlug(slugPrefix)}`);
    } else {
      // For non-timestamp slugs, find next live/upcoming from time_windows
      const next = event.time_windows?.find(tw => tw.status === 'live' || tw.status === 'upcoming');
      if (next) router.push(`/event/${next.slug}`);
    }
  }

  const TABS: { key: LiveTab; label: string }[] = [
    { key: 'order_book', label: 'Order Book' },
    { key: 'comments', label: 'Comments' },
    { key: 'positions', label: 'Positions' },
    { key: 'top_holders', label: 'Top Holders' },
    { key: 'activity', label: 'Activity' },
  ];

  const displayPrice = cryptoPrice ?? event.reference_price ?? 0;
  const displayRef = refPrice ?? event.reference_price ?? 0;
  const priceChange = displayPrice - displayRef;
  const priceUp = priceChange >= 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4" style={{ paddingTop: 20, paddingBottom: 48 }}>
      {/* Breadcrumb */}
      <div className="flex items-center" style={{ gap: 6, marginBottom: 16, fontSize: 13 }}>
        <Link href="/" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>Markets</Link>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <Link href="/crypto" className="hover:underline" style={{ color: 'var(--text-secondary)' }}>Crypto</Link>
      </div>

      {/* Two-column layout — sidebar starts at the top */}
      <div className="flex" style={{ gap: 32 }}>
        {/* ── Left column ── */}
        <div className="flex-1 min-w-0">

      {/* Header: image + series title + time range + action buttons */}
      {(() => {
        // Extract series title and time range from event title
        // e.g. "Bitcoin Up or Down - March 9, 12:00PM-12:05PM ET" → series: "Bitcoin Up or Down - 5 Minutes", time: "March 9, 12:00-12:05PM ET"
        const titleParts = event.title.match(/^(.+?)\s*-\s*(.+)$/);
        const seriesName = titleParts ? titleParts[1] : event.title;
        const timeRange = titleParts ? titleParts[2] : '';

        return (
          <div className="flex items-center" style={{ gap: 16, marginBottom: 20 }}>
            {event.image_url ? (
              <img src={event.image_url} alt="" className="flex-shrink-0 object-cover" loading="lazy" style={{ width: 56, height: 56, borderRadius: 12 }} />
            ) : (
              <div className="flex-shrink-0" style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--bg-surface)' }} />
            )}
            <div className="min-w-0" style={{ flex: 1 }}>
              <h1 className="font-bold" style={{ fontSize: 24, lineHeight: '30px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {seriesName}
              </h1>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 2 }}>
                {timeRange}
              </p>
            </div>
            {/* Action buttons */}
            <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
              <button onClick={handleShare} className="flex items-center justify-center rounded-full transition-colors hover:opacity-70" style={{ width: 36, height: 36, color: copied ? 'var(--yes-green)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }} title="Share">
                {copied ? (
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                )}
              </button>
              <button onClick={() => setBookmarked(!bookmarked)} className="flex items-center justify-center rounded-full transition-colors hover:opacity-70" style={{ width: 36, height: 36, color: bookmarked ? 'var(--brand-blue)' : 'var(--text-secondary)', background: 'var(--bg-surface)' }} title={bookmarked ? 'Remove bookmark' : 'Bookmark'}>
                <svg width="15" height="15" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Price to beat | Current price | Countdown — Polymarket-style row */}
      {!isPastResolved && (
        <div className="flex items-center" style={{ gap: 0, marginBottom: 20 }}>
          {/* Price to beat */}
          <div style={{ paddingRight: 24 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>Price to beat</div>
            <div className="font-bold tabular-nums" style={{ fontSize: 24, color: 'var(--text-primary)' }}>
              {refPrice !== null
                ? `$${refPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 44, background: 'var(--border)', marginRight: 24 }} />

          {/* Current price */}
          <div style={{ flex: 1 }}>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: priceUp ? 'var(--yes-green)' : 'var(--no-red)' }}>Current price</span>
              {cryptoPrice !== null && refPrice !== null && (
                <span className="flex items-center tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: priceUp ? 'var(--yes-green)' : 'var(--no-red)', gap: 2 }}>
                  {priceUp ? '▲' : '▼'} ${Math.abs(priceChange).toFixed(2)}
                </span>
              )}
            </div>
            <div>
              {cryptoPrice !== null ? (
                <ScrollingNumber
                  value={`$${cryptoPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  fontSize={24}
                  color={priceUp ? 'var(--yes-green)' : 'var(--no-red)'}
                />
              ) : (
                <span className="font-bold" style={{ fontSize: 24, color: 'var(--text-muted)' }}>—</span>
              )}
            </div>
          </div>

          {/* Countdown timer */}
          {countdown && !resolved && (() => {
            const parts = countdown.split(':');
            const mins = parts[0] || '0';
            const secs = parts[1] || '00';
            return (
              <div className="flex items-center flex-shrink-0" style={{ gap: 3, padding: '8px 14px', borderRadius: 12, background: 'var(--bg-card)' }}>
                <ScrollingNumber value={mins.padStart(2, '0')} fontSize={28} color="var(--no-red)" />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>MINS</span>
                <ScrollingNumber value={secs} fontSize={28} color="var(--no-red)" />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>SECS</span>
              </div>
            );
          })()}
          {resolved && (
            <span className="font-bold flex-shrink-0" style={{ fontSize: 16, color: resolvedOutcome === 'Up' ? 'var(--yes-green)' : 'var(--no-red)' }}>
              Resolved: {resolvedOutcome}
            </span>
          )}

        </div>
      )}

      {/* Time window pills: Past dropdown | current LIVE | 3 future */}
      {event.time_windows && event.time_windows.length > 0 && (() => {
        const resolvedPills = event.time_windows!.filter((tw) => tw.status === 'resolved' && tw.slug !== event.slug).reverse();
        const livePill = event.time_windows!.find((tw) => tw.slug === event.slug);
        const futurePills = event.time_windows!.filter((tw) => tw.status === 'upcoming' && tw.slug !== event.slug).slice(0, 3);

        return (
          <div className="relative flex items-center" style={{ gap: 6, marginBottom: 24 }}>
            {/* Past dropdown */}
            {resolvedPills.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowAllPills(!showAllPills)}
                  className="flex items-center transition-colors hover:opacity-80 flex-shrink-0"
                  style={{
                    fontSize: 12, fontWeight: 500, padding: '6px 12px',
                    borderRadius: 9999, gap: 5,
                    background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                  }}
                >
                  Past ({resolvedPills.length})
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M6 9l6 6 6-6" /></svg>
                </button>
                {showAllPills && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowAllPills(false)} />
                    <div
                      className="absolute left-0 z-50 overflow-y-auto"
                      style={{
                        top: '100%', marginTop: 4, minWidth: 180, maxHeight: 360,
                        borderRadius: 10, padding: 4,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                      }}
                    >
                      {resolvedPills.map((tw) => {
                        const isUp = tw.winning_outcome === 'Up';
                        const isDown = tw.winning_outcome === 'Down';
                        return (
                          <Link
                            key={tw.slug}
                            href={`/event/${tw.slug}`}
                            onClick={() => setShowAllPills(false)}
                            className="flex items-center justify-between transition-colors tabular-nums"
                            style={{
                              fontSize: 12, fontWeight: 500, padding: '7px 10px',
                              borderRadius: 6, gap: 8,
                              color: 'var(--text-secondary)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <span className="flex items-center" style={{ gap: 6 }}>
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="var(--text-muted)"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.41 5.59a.75.75 0 00-1.06 0L7 8.94 5.65 7.59a.75.75 0 10-1.06 1.06l1.88 1.88a.75.75 0 001.06 0l3.88-3.88a.75.75 0 000-1.06z"/></svg>
                              {tw.label}
                            </span>
                            {(isUp || isDown) && (
                              <span
                                className="font-semibold"
                                style={{
                                  fontSize: 11,
                                  color: isUp ? 'var(--yes-green)' : 'var(--no-red)',
                                }}
                              >
                                {isUp ? '▲ Up' : '▼ Down'}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Current / live pill */}
            {livePill && (
              <Link
                href={`/event/${livePill.slug}`}
                className="flex items-center transition-colors hover:opacity-80 tabular-nums flex-shrink-0"
                style={{
                  fontSize: 12, fontWeight: 600, padding: '6px 12px',
                  borderRadius: 9999, gap: 5,
                  background: livePill.status === 'live' ? 'var(--no-red)' : 'var(--bg-hover)',
                  color: livePill.status === 'live' ? '#fff' : 'var(--text-primary)',
                }}
              >
                {livePill.status === 'live' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
                )}
                {livePill.label}
              </Link>
            )}

            {/* Next 3 future pills */}
            {futurePills.map((tw) => (
              <Link
                key={tw.slug}
                href={`/event/${tw.slug}`}
                className="flex items-center transition-colors hover:opacity-80 tabular-nums flex-shrink-0"
                style={{
                  fontSize: 12, fontWeight: 500, padding: '6px 12px',
                  borderRadius: 9999,
                  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                }}
              >
                {tw.label}
              </Link>
            ))}
          </div>
        );
      })()}

          {/* Resolved banner for past windows */}
          {isPastResolved && pastWinner && (
            <div style={{
              marginBottom: 16,
              padding: '20px 24px',
              borderRadius: 12,
              background: pastWinner === 'Up' ? 'var(--green-bg)' : 'var(--red-bg)',
              border: `1px solid ${pastWinner === 'Up' ? 'var(--yes-green)' : 'var(--no-red)'}`,
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: pastWinner === 'Up' ? 'var(--yes-green)' : 'var(--no-red)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {pastWinner === 'Up' ? (
                      <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    ) : (
                      <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    )}
                  </div>
                  <div>
                    <div className="font-bold" style={{ fontSize: 18, color: pastWinner === 'Up' ? 'var(--yes-green)' : 'var(--no-red)' }}>
                      Resolved: {pastWinner}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {assetName} price was {pastWinner === 'Up' ? 'above' : 'below'} the reference price at expiry
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleGoToLive}
                  className="font-semibold transition-colors hover:opacity-80"
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 13,
                    background: 'var(--no-red)', color: '#fff',
                  }}
                >
                  <span className="flex items-center" style={{ gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
                    Go to Live Market
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Chart */}
          {!isPastResolved && (
            <div style={{ marginBottom: 16 }}>
              <CryptoLiveChart refPrice={displayRef || null} symbol={binanceSymbol} />
            </div>
          )}

          {/* Past resolved: reference price card */}
          {isPastResolved && (
            <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 16 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>Reference Price</div>
                  <div className="font-bold tabular-nums" style={{ fontSize: 24, color: 'var(--text-primary)' }}>
                    ${(event.reference_price ?? 87500).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>Resolved At</div>
                  <div className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
                    {event.end_date_iso ? new Date(event.end_date_iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Up / Down outcome rows */}
          <div className="overflow-hidden" style={{ borderRadius: 12, border: '1px solid var(--border)', marginBottom: 24 }}>
            {/* Up */}
            <div className="flex items-center justify-between" style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              ...(isResolved && winnerOutcome === 'Up' ? { background: 'var(--green-bg)' } : {}),
            }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                {isResolved && winnerOutcome === 'Up' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="var(--yes-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: isResolved && winnerOutcome !== 'Up' ? 'var(--text-muted)' : 'var(--yes-green)', flexShrink: 0 }} />
                )}
                <span className="font-medium" style={{ fontSize: 14, color: isResolved && winnerOutcome !== 'Up' ? 'var(--text-muted)' : 'var(--text-primary)' }}>Up</span>
                <svg width="14" height="14" fill="none" stroke={isResolved && winnerOutcome !== 'Up' ? 'var(--text-muted)' : 'var(--yes-green)'} viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                {!isResolved && (
                  <span className="font-bold tabular-nums" style={{ fontSize: 15, color: 'var(--yes-green)' }}>{displayUpPct}%</span>
                )}
                {isResolved && winnerOutcome === 'Up' && (
                  <span className="font-semibold" style={{ fontSize: 13, color: 'var(--yes-green)' }}>Winner</span>
                )}
              </div>
              <div className="flex items-center" style={{ gap: 6 }}>
                {!isResolved ? (
                  <button onClick={() => handleBuyClick('Yes')} className="font-semibold transition-colors hover:opacity-80 tabular-nums text-center" style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, background: 'var(--green-bg)', color: 'var(--yes-green)' }}>
                    Up {displayUpPct}¢
                  </button>
                ) : winnerOutcome === 'Up' ? (
                  <span className="font-semibold tabular-nums" style={{ fontSize: 14, color: 'var(--yes-green)' }}>$1.00</span>
                ) : (
                  <span className="font-semibold tabular-nums" style={{ fontSize: 14, color: 'var(--text-muted)' }}>$0.00</span>
                )}
              </div>
            </div>
            {/* Down */}
            <div className="flex items-center justify-between" style={{
              padding: '12px 16px',
              ...(isResolved && winnerOutcome === 'Down' ? { background: 'var(--red-bg)' } : {}),
            }}>
              <div className="flex items-center" style={{ gap: 10 }}>
                {isResolved && winnerOutcome === 'Down' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="var(--no-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: isResolved && winnerOutcome !== 'Down' ? 'var(--text-muted)' : 'var(--no-red)', flexShrink: 0 }} />
                )}
                <span className="font-medium" style={{ fontSize: 14, color: isResolved && winnerOutcome !== 'Down' ? 'var(--text-muted)' : 'var(--text-primary)' }}>Down</span>
                <svg width="14" height="14" fill="none" stroke={isResolved && winnerOutcome !== 'Down' ? 'var(--text-muted)' : 'var(--no-red)'} viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                {!isResolved && (
                  <span className="font-bold tabular-nums" style={{ fontSize: 15, color: 'var(--no-red)' }}>{displayDownPct}%</span>
                )}
                {isResolved && winnerOutcome === 'Down' && (
                  <span className="font-semibold" style={{ fontSize: 13, color: 'var(--no-red)' }}>Winner</span>
                )}
              </div>
              <div className="flex items-center" style={{ gap: 6 }}>
                {!isResolved ? (
                  <button onClick={() => handleBuyClick('No')} className="font-semibold transition-colors hover:opacity-80 tabular-nums text-center" style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, background: 'var(--red-bg)', color: 'var(--no-red)' }}>
                    Down {displayDownPct}¢
                  </button>
                ) : winnerOutcome === 'Down' ? (
                  <span className="font-semibold tabular-nums" style={{ fontSize: 14, color: 'var(--no-red)' }}>$1.00</span>
                ) : (
                  <span className="font-semibold tabular-nums" style={{ fontSize: 14, color: 'var(--text-muted)' }}>$0.00</span>
                )}
              </div>
            </div>
          </div>

          {/* (Countdown bar removed — integrated into header price row) */}

          {/* Live resolution banner (just resolved, auto-navigating) */}
          {resolved && resolvedOutcome && !isPastResolved && (
            <div style={{
              marginBottom: 24,
              padding: '20px 24px',
              borderRadius: 12,
              background: resolvedOutcome === 'Up' ? 'var(--green-bg)' : 'var(--red-bg)',
              border: `1px solid ${resolvedOutcome === 'Up' ? 'var(--yes-green)' : 'var(--no-red)'}`,
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: resolvedOutcome === 'Up' ? 'var(--yes-green)' : 'var(--no-red)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {resolvedOutcome === 'Up' ? (
                      <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    ) : (
                      <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    )}
                  </div>
                  <div>
                    <div className="font-bold" style={{ fontSize: 18, color: resolvedOutcome === 'Up' ? 'var(--yes-green)' : 'var(--no-red)' }}>
                      Resolved: {resolvedOutcome}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      BTC ${displayPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} was {resolvedOutcome === 'Up' ? '≥' : '<'} ref ${displayRef.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="font-semibold tabular-nums" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
                    Next market in {autoNavCountdown}s
                  </div>
                  <button onClick={handleGoToLive} className="font-medium hover:underline" style={{ fontSize: 13, color: 'var(--brand-blue)', marginTop: 4 }}>
                    Go now →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* (Chart moved above outcome rows) */}

          {/* Section tabs */}
          <div className="flex items-center" style={{ borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative transition-colors"
                style={{ padding: '12px 16px', fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 500, color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute left-4 right-4" style={{ bottom: 0, height: 2, borderRadius: 1, background: 'var(--brand-blue)' }} />
                )}
              </button>
            ))}
          </div>

          {activeTab === 'order_book' && selectedYesToken && (
            <div style={{ marginBottom: 32 }}>
              <OrderBook marketId={selectedMarket.id} tokenId={selectedYesToken.token_id} />
            </div>
          )}
          {activeTab === 'comments' && <div style={{ marginBottom: 32 }}><Comments marketId={selectedMarket.id} /></div>}
          {activeTab === 'positions' && (
            <div style={{ marginBottom: 32 }}>
              <div className="text-center" style={{ padding: '40px 20px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>No positions yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Connect your wallet and trade to see your positions here.</p>
              </div>
            </div>
          )}
          {activeTab === 'top_holders' && <div style={{ marginBottom: 32 }}><TopHolders marketId={selectedMarket.id} /></div>}
          {activeTab === 'activity' && (
            <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TradeHistory marketId={selectedMarket.id} />
              <OrderHistory marketId={selectedMarket.id} />
            </div>
          )}

          {/* Rules */}
          <div style={{ marginBottom: 32 }}>
            <h3 className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 12 }}>Rules</h3>
            <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              {event.description && (
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{event.description}</p>
              )}
              {!isPastResolved && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
                  <p>Because this window resolves in 5 minutes, odds can shift sharply in the final seconds. Prices update in real-time as traders react to live Bitcoin price movements.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="hidden lg:block flex-shrink-0" style={{ width: 340 }}>
          <div ref={tradePanelRef} className="sticky" style={{ top: 76, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Trade panel — only show for non-resolved */}
            {!isResolved && (
              <TradePanel market={selectedMarket} initialOutcome={tradeOutcome} />
            )}

            {/* Order Book */}
            {selectedYesToken && !isResolved && (
              <OrderBook marketId={selectedMarket.id} tokenId={selectedYesToken.token_id} />
            )}

            {/* Market info */}
            <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Volume', value: formatVolumeExact(event.volume) },
                  ...(!isPastResolved ? [{ label: 'Liquidity', value: formatVolume(event.liquidity) }] : []),
                  { label: 'Reference Price', value: `$${(displayRef || event.reference_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
                  ...(event.end_date_iso ? [{
                    label: isPastResolved ? 'Resolved At' : 'Resolves',
                    value: new Date(event.end_date_iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                  }] : []),
                  ...(isResolved && winnerOutcome ? [{ label: 'Outcome', value: winnerOutcome }] : []),
                  { label: 'Source', value: 'Chainlink BTC/USD' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between" style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Sports / Esports Match Page (Polymarket-style)
// ─────────────────────────────────────────────────────────────────────────────

function SportsMatchPage({ event }: { event: EventGroup }) {
  const match = event.match!;
  type ContentTab = 'comments' | 'top-holders' | 'positions' | 'activity';
  const [activeTab, setActiveTab] = useState('series');
  const [contentTab, setContentTab] = useState<ContentTab>('comments');
  const [selectedOutcome, setSelectedOutcome] = useState<{ marketId: string; label: string; price: number } | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [sliderSelections, setSliderSelections] = useState<Record<string, number>>({});

  const matchDate = new Date(match.start_time);
  const dateStr = matchDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = matchDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const totalVolume = match.market_types.reduce((s, t) => s + t.volume, 0);

  const leagueShort = match.league.includes('NBA') ? 'NBA' : match.league.includes('LCK') ? 'LCK' : match.league.includes('VCT') ? 'VCT' : match.league;

  // Compute tabs: "Series Lines" + per-game tabs (Polymarket layout)
  const gameNumbers = new Set<number>();
  match.market_types.forEach(mt => {
    const gm = mt.label.match(/Game (\d+)/i);
    if (gm) gameNumbers.add(parseInt(gm[1]));
  });
  const sortedGames = Array.from(gameNumbers).sort((a, b) => a - b);
  const matchTabs = [
    { id: 'series', label: 'Series Lines' },
    ...sortedGames.map(n => ({ id: `game-${n}`, label: `Game ${n}` })),
  ];

  // Default select first moneyline outcome for sidebar
  const defaultOutcome = match.market_types[0]?.markets[0];
  const active = selectedOutcome ?? (defaultOutcome ? { marketId: defaultOutcome.id, label: defaultOutcome.label, price: defaultOutcome.price } : null);

  // "More games" — empty for now
  const moreGames: Market[] = [];

  const faqs = [
    { q: `What is the "${match.team1.name} vs. ${match.team2.name}" prediction market?`, a: `This market lets you trade on the outcome of the ${match.team1.name} vs ${match.team2.name} match in the ${match.league}. You can bet on the winner, spread, and totals.` },
    { q: `How much trading activity has "${match.team1.name} vs. ${match.team2.name}" generated on GainLoft?`, a: `This market has generated ${formatVolume(totalVolume)} in total trading volume across all market types.` },
    { q: `How do I trade on "${match.team1.name} vs. ${match.team2.name}"?`, a: 'Select an outcome from the markets below and enter the number of shares you want to buy. Each share pays $1 if correct.' },
    { q: `What are the current odds for "${match.team1.name} vs. ${match.team2.name}"?`, a: `The current moneyline odds are ${match.market_types[0]?.markets.map(m => `${m.label.toUpperCase()}: ${Math.round(m.price * 100)}¢`).join(', ')}.` },
    { q: `How will "${match.team1.name} vs. ${match.team2.name}" be resolved?`, a: 'Markets resolve based on the official match result as reported by the league. Results are typically confirmed within minutes of the match ending.' },
  ];

  return (
    <div className="mx-auto" style={{ maxWidth: 1200, padding: '0 24px' }}>
      {/* Breadcrumb + title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', paddingTop: 16 }}>
        <Link href="/" style={{ color: 'var(--text-muted)' }} className="hover:underline">Sports</Link>
        <span>·</span>
        <span style={{ color: 'var(--text-secondary)' }}>{leagueShort}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {match.team1.name} vs {match.team2.name}
        </h1>
        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Share */}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
          </button>
          {/* Chart */}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 5-5" /></svg>
          </button>
          {/* Bookmark */}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          </button>
          {/* Link */}
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          </button>
        </div>
      </div>

      {/* ════════ Two-column layout ════════ */}
      <div style={{ display: 'flex', gap: 24 }}>

        {/* ═══ LEFT: main content ═══ */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Match header (Polymarket-style) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '24px 0 8px' }}>
            {/* Team 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {match.team1.logo ? (
                  <img src={match.team1.logo} alt="" loading="eager" style={{ width: 48, height: 48, objectFit: 'contain' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = `<span style="font-size:18px;font-weight:700;color:var(--text-primary)">${match.team1.abbr}</span>`; }} />
                ) : (
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{match.team1.abbr}</span>
                )}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {match.team1.name.length > 18 ? match.team1.abbr : match.team1.name}
              </span>
            </div>

            {/* Center: scores + live status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 120, justifyContent: 'center' }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {match.score?.team1 ?? 0}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                {match.status === 'live' ? (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#ef4444' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', animation: 'pulse-live 2s ease-in-out infinite' }} />
                      LIVE
                    </span>
                    {match.status_detail && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {match.status_detail}
                      </span>
                    )}
                  </>
                ) : match.status === 'final' ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>FINAL</span>
                ) : (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{dateStr}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeStr}</span>
                  </>
                )}
              </div>
              <span style={{ fontSize: 40, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {match.score?.team2 ?? 0}
              </span>
            </div>

            {/* Team 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {match.team2.logo ? (
                  <img src={match.team2.logo} alt="" loading="eager" style={{ width: 48, height: 48, objectFit: 'contain' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = `<span style="font-size:18px;font-weight:700;color:var(--text-primary)">${match.team2.abbr}</span>`; }} />
                ) : (
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{match.team2.abbr}</span>
                )}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {match.team2.name.length > 18 ? match.team2.abbr : match.team2.name}
              </span>
            </div>
          </div>

          {/* Volume line */}
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            {formatVolume(totalVolume)} Vol.
          </div>

          {/* ── Price chart ── */}
          {(() => {
            const chartMarket = event.markets.find(m => m.id === active?.marketId) ?? event.markets[0];
            const chartToken = chartMarket?.tokens.find(t => t.outcome === 'Yes');
            if (!chartMarket || !chartToken) return null;
            return (
              <div style={{ marginBottom: 20 }}>
                <PriceChart marketId={chartMarket.id} tokenId={chartToken.token_id} />
              </div>
            );
          })()}

          {/* ════════ Game tabs (Polymarket layout) ════════ */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
            {matchTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  position: 'relative',
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, background: 'var(--text-primary)', borderRadius: 1 }} />
                )}
              </button>
            ))}
          </div>

          {/* ════════ Market cards (filtered by active tab) ════════ */}
          {(() => {
            const tabMarkets = activeTab === 'series'
              ? match.market_types.filter(mt => !mt.label.match(/Game \d+/i))
              : match.market_types.filter(mt => {
                  const gameNum = activeTab.replace('game-', '');
                  return mt.label.match(new RegExp(`Game ${gameNum}\\b`, 'i'));
                });

            // DEBUG: show market type count
            console.log('[SportsMatchPage] market_types:', match.market_types.length, match.market_types.map(mt => mt.label));
            if (tabMarkets.length === 0) {
              return (
                <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
                  No markets available
                </div>
              );
            }

            // Group market_types that share the same label and have slider_values
            // e.g., multiple "Spreads" entries → one card with pill selector
            type GroupedCard = {
              label: string;
              volume: number;
              sliderValues: number[];
              entries: typeof tabMarkets;
              isSlider: true;
            } | {
              label: string;
              mt: (typeof tabMarkets)[0];
              isSlider: false;
            };

            const cards: GroupedCard[] = [];
            const seenSliderLabels = new Set<string>();

            for (const mt of tabMarkets) {
              if (mt.slider_values && mt.slider_values.length > 0) {
                // This is the first entry of a slider group
                if (seenSliderLabels.has(mt.label)) continue;
                seenSliderLabels.add(mt.label);
                // Collect all entries with the same label
                const group = tabMarkets.filter(t => t.label === mt.label);
                cards.push({
                  label: mt.label,
                  volume: mt.volume,
                  sliderValues: mt.slider_values,
                  entries: group,
                  isSlider: true,
                });
              } else if (!seenSliderLabels.has(mt.label)) {
                // Regular card (moneyline, BTTS, etc.)
                cards.push({ label: mt.label, mt, isSlider: false });
              }
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cards.map((card) => {
                  if (card.isSlider) {
                    // ── Slider card (Spreads / Totals) ──
                    const values = card.sliderValues;
                    const selectedIdx = sliderSelections[card.label] ?? Math.floor(values.length / 2);
                    const currentVal = values[selectedIdx] ?? values[0];
                    const currentEntry = card.entries[selectedIdx] ?? card.entries[0];

                    return (
                      <div key={`slider-${card.label}`} style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', overflow: 'hidden' }}>
                        {/* Card header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 0' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{card.label}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatVolume(card.volume)} Vol.</span>
                        </div>
                        {/* Pill selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px 0', overflowX: 'auto' }}>
                          <button
                            onClick={() => setSliderSelections(prev => ({ ...prev, [card.label]: Math.max(0, selectedIdx - 1) }))}
                            disabled={selectedIdx === 0}
                            style={{
                              width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)',
                              background: 'var(--bg-surface)', cursor: selectedIdx === 0 ? 'default' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              opacity: selectedIdx === 0 ? 0.3 : 1, color: 'var(--text-primary)',
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M15 18l-6-6 6-6" /></svg>
                          </button>
                          <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center' }}>
                            {values.map((v, vi) => (
                              <button
                                key={v}
                                onClick={() => setSliderSelections(prev => ({ ...prev, [card.label]: vi }))}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 16,
                                  fontSize: 13,
                                  fontWeight: vi === selectedIdx ? 600 : 400,
                                  fontVariantNumeric: 'tabular-nums',
                                  background: vi === selectedIdx ? 'var(--text-primary)' : 'transparent',
                                  color: vi === selectedIdx ? 'var(--bg-card)' : 'var(--text-muted)',
                                  border: vi === selectedIdx ? 'none' : '1px solid var(--border)',
                                  cursor: 'pointer',
                                  transition: 'all 150ms',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setSliderSelections(prev => ({ ...prev, [card.label]: Math.min(values.length - 1, selectedIdx + 1) }))}
                            disabled={selectedIdx === values.length - 1}
                            style={{
                              width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)',
                              background: 'var(--bg-surface)', cursor: selectedIdx === values.length - 1 ? 'default' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              opacity: selectedIdx === values.length - 1 ? 0.3 : 1, color: 'var(--text-primary)',
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M9 18l6-6-6-6" /></svg>
                          </button>
                        </div>
                        {/* Outcome buttons for selected value */}
                        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 16px' }}>
                          {currentEntry.markets.map((m) => {
                            const cents = Math.round(m.price * 100);
                            const isSelected = active?.marketId === m.id;
                            return (
                              <button
                                key={m.id}
                                onClick={() => setSelectedOutcome({ marketId: m.id, label: m.label, price: m.price })}
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '10px 14px',
                                  background: isSelected ? 'rgba(0,200,83,0.08)' : 'var(--bg-surface)',
                                  color: 'var(--text-primary)',
                                  border: isSelected ? '2px solid var(--yes-green)' : '1px solid var(--border)',
                                  borderRadius: 8,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontWeight: 700,
                                  fontVariantNumeric: 'tabular-nums',
                                  transition: 'border-color 150ms, background 150ms',
                                }}
                              >
                                <span style={{ fontWeight: 500 }}>{m.label}</span>
                                <span>{cents}¢</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // ── Regular card (Moneyline, BTTS, etc.) ──
                  const mt = card.mt;
                  const isMoneyline = /moneyline|winner|match winner/i.test(mt.label) && !(/handicap|spread|O\/U|total|batter|toss|completed/i.test(mt.label));
                  const isBTTS = /both teams to score/i.test(mt.label);
                  const isHandicap = /handicap|spread/i.test(mt.label);
                  const isTotal = /O\/U|total|over.?under/i.test(mt.label);

                  return (
                    <div key={mt.id} style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', overflow: 'hidden' }}>
                      {/* Card header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 0' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{mt.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatVolume(mt.volume)} Vol.</span>
                      </div>
                      {/* Outcome buttons — Polymarket colored style */}
                      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 16px' }}>
                        {mt.markets.map((m, idx) => {
                          const cents = Math.round(m.price * 100);
                          const isSelected = active?.marketId === m.id;

                          // Determine button style based on market type and position
                          let bg = 'var(--bg-surface)';
                          let color = 'var(--text-primary)';
                          let border = '1px solid var(--border)';
                          let label = m.label;

                          if (isMoneyline) {
                            if (idx === 0) {
                              bg = 'var(--green-bg)';
                              color = 'var(--yes-green)';
                              border = 'none';
                              label = `${match.team1.abbr} ${cents}¢`;
                            } else if (idx === mt.markets.length - 1 && mt.markets.length <= 2) {
                              bg = 'var(--red-bg)';
                              color = 'var(--no-red)';
                              border = 'none';
                              label = `${match.team2.abbr} ${cents}¢`;
                            } else if (idx === mt.markets.length - 1 && mt.markets.length === 3) {
                              bg = 'var(--red-bg)';
                              color = 'var(--no-red)';
                              border = 'none';
                              label = `${match.team2.abbr} ${cents}¢`;
                            } else {
                              label = `DRAW ${cents}¢`;
                            }
                          } else if (isBTTS) {
                            // BTTS: Yes = green, No = red
                            if (idx === 0) {
                              bg = 'var(--green-bg)';
                              color = 'var(--yes-green)';
                              border = 'none';
                              label = `YES ${cents}¢`;
                            } else {
                              bg = 'var(--red-bg)';
                              color = 'var(--no-red)';
                              border = 'none';
                              label = `NO ${cents}¢`;
                            }
                          } else if (isHandicap || isTotal) {
                            label = `${m.label}`;
                          }

                          if (isSelected) {
                            border = '2px solid var(--yes-green)';
                            bg = isMoneyline || isBTTS ? bg : 'rgba(0,200,83,0.08)';
                          }

                          return (
                            <button
                              key={m.id}
                              onClick={() => setSelectedOutcome({ marketId: m.id, label: m.label, price: m.price })}
                              style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: (isMoneyline || isBTTS) ? 'center' : 'space-between',
                                padding: '10px 14px',
                                background: bg, color, border,
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 14,
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                transition: 'border-color 150ms, background 150ms',
                              }}
                            >
                              {(isMoneyline || isBTTS) ? (
                                <span>{label}</span>
                              ) : (
                                <>
                                  <span style={{ fontWeight: 500 }}>{m.label}</span>
                                  <span>{cents}¢</span>
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ════════ Content tabs ════════ */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginTop: 32, overflowX: 'auto' }}>
            {(['comments', 'top-holders', 'positions', 'activity'] as ContentTab[]).map((tab) => {
              const labels: Record<ContentTab, string> = { comments: 'Comments', 'top-holders': 'Top Holders', positions: 'Positions', activity: 'Activity' };
              return (
                <button
                  key={tab}
                  onClick={() => setContentTab(tab)}
                  style={{
                    position: 'relative',
                    padding: '10px 14px',
                    fontSize: 14,
                    fontWeight: contentTab === tab ? 600 : 400,
                    color: contentTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {labels[tab]}
                  {contentTab === tab && (
                    <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, background: 'var(--text-primary)', borderRadius: 1 }} />
                  )}
                </button>
              );
            })}
          </div>

          {contentTab === 'comments' && <div style={{ marginTop: 16 }}><Comments marketId={event.id} /></div>}
          {contentTab === 'top-holders' && <div style={{ marginTop: 16 }}><TopHolders marketId={event.markets[0]?.id ?? ''} /></div>}
          {contentTab === 'activity' && <div style={{ marginTop: 16 }}><TradeHistory marketId={event.markets[0]?.id ?? ''} /></div>}
          {contentTab === 'positions' && (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
              Connect wallet to view positions
            </div>
          )}

          {/* ════════ FAQ ════════ */}
          <div style={{ marginTop: 40, marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Frequently Asked Questions</h2>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {faqs.map((faq, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', paddingRight: 16 }}>{faq.q}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}
                      style={{ flexShrink: 0, transition: 'transform 200ms', transform: faqOpen === i ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {faqOpen === i && (
                    <div style={{ paddingBottom: 14, fontSize: 13, lineHeight: '20px', color: 'var(--text-secondary)' }}>{faq.a}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: sticky trade panel sidebar ═══ */}
        <div className="hidden lg:block" style={{ width: 340, flexShrink: 0 }}>
          <div style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Unified betslip: OutcomeDropdown + TradePanel */}
            {event.markets[0] && (
              <div className="rounded-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <OutcomeDropdown
                  markets={event.markets}
                  selectedId={event.markets.find(m => m.id === selectedOutcome?.marketId)?.id ?? event.markets[0].id}
                  onSelect={(id) => {
                    const m = event.markets.find(mk => mk.id === id);
                    if (m) {
                      const yesPrice = m.tokens.find(t => t.outcome === 'Yes')?.price ?? 0.5;
                      setSelectedOutcome({ marketId: m.id, label: m.group_item_title || m.question, price: yesPrice });
                    }
                  }}
                />
                <TradePanel
                  market={event.markets.find(m => m.id === selectedOutcome?.marketId) ?? event.markets[0]}
                  bare
                />
              </div>
            )}

            {/* More Games */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>More {leagueShort} Games</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {moreGames.map((g) => {
                  const yesPrice = g.tokens.find(t => t.outcome === 'Yes')?.price ?? 0.5;
                  const noPrice = g.tokens.find(t => t.outcome === 'No')?.price ?? 0.5;
                  return (
                    <Link key={g.id} href={`/event/${g.slug}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatVolume(g.volume)} Vol.</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {g.image_url && <img src={g.image_url} alt="" loading="lazy" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} />}
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{g.tokens.find(t => t.outcome === 'Yes')?.label ?? g.question.split(' ')[0]}</span>
                        </div>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(yesPrice * 100)}¢</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{g.tokens.find(t => t.outcome === 'No')?.label ?? 'No'}</span>
                        </div>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(noPrice * 100)}¢</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Router: detect event group vs single market
// ─────────────────────────────────────────────────────────────────────────────

export default function EventPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  // BTC live redirect: resolve dynamic slug on client and redirect
  useEffect(() => {
    if (slug === 'btc-live-redirect') {
      router.replace(`/event/${getCurrentBtcLiveSlug()}`);
    }
  }, [slug, router]);

  if (slug === 'btc-live-redirect') {
    return (
      <div className="mx-auto max-w-[1200px] px-4 text-center" style={{ paddingTop: 80, paddingBottom: 80, color: 'var(--text-muted)', fontSize: 14 }}>
        Loading live market...
      </div>
    );
  }

  // Try event group first (multi-outcome, live, or match) from dummy data
  const eventGroup = getEventGroupBySlug(slug);
  if (eventGroup) {
    if (/^(btc|eth|sol|xrp|doge)-updown-\d+m?-\d+$/.test(eventGroup.slug) || isCryptoUpDownEvent(eventGroup)) {
      return <LiveMarketPage event={eventGroup} />;
    }
    if (eventGroup.match) {
      return <SportsMatchPage event={eventGroup} />;
    }
    return <MultiOutcomeEventPage event={eventGroup} />;
  }

  // Fall back to Polymarket API / single market
  return <PolymarketLoader slug={slug} />;
}

/** Fetches from Polymarket proxy, then falls back to backend API + dummy data */
interface RelatedEvent {
  slug: string;
  title: string;
  endDate: string;
  closed: boolean;
  winning_outcome: string | null;
}

function PolymarketLoader({ slug }: { slug: string }) {
  const { data: polyData, isLoading: polyLoading } = useSWR<{ type: 'market' | 'event_group'; data: Market | EventGroup; related?: RelatedEvent[] }>(
    slug ? `/api/polymarket/event/${slug}` : null,
    (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    { refreshInterval: 15000, onError: () => {} }
  );

  const { data: apiMarket, isLoading: apiLoading } = useSWR<Market>(
    slug ? `/api/markets/${slug}` : null,
    fetcher,
    { refreshInterval: 5000, onError: () => {} }
  );

  // Polymarket returned data
  if (polyData) {
    const related = polyData.related || [];
    const now = Date.now();

    // Helper: build time_windows from current event + related events
    const buildTimeWindows = (currentSlug: string, currentEndDate: string | null, currentClosed: boolean) => {
      return [
        {
          label: new Date(currentEndDate || '').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          slug: currentSlug,
          status: (currentClosed ? 'resolved' : currentEndDate && new Date(currentEndDate).getTime() > now ? 'live' : 'resolved') as 'live' | 'resolved' | 'upcoming',
        },
        ...related.map(r => {
          const endTime = new Date(r.endDate).getTime();
          return {
            label: new Date(r.endDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            slug: r.slug,
            status: (r.closed ? 'resolved' : endTime > now ? 'upcoming' : 'live') as 'live' | 'resolved' | 'upcoming',
            winning_outcome: r.winning_outcome || null,
          };
        }),
      ].sort((a, b) => {
        // Sort by endDate extracted from related, or by timestamp in slug
        const tsA = parseInt(a.slug.match(/-(\d{10})$/)?.[1] || '0');
        const tsB = parseInt(b.slug.match(/-(\d{10})$/)?.[1] || '0');
        if (tsA && tsB) return tsA - tsB;
        // Fallback: sort by label time (for non-timestamp slugs)
        const relA = related.find(r => r.slug === a.slug);
        const relB = related.find(r => r.slug === b.slug);
        const dateA = relA ? new Date(relA.endDate).getTime() : new Date(a.slug === currentSlug ? (currentEndDate || '') : '').getTime();
        const dateB = relB ? new Date(relB.endDate).getTime() : new Date(b.slug === currentSlug ? (currentEndDate || '') : '').getTime();
        return dateA - dateB;
      });
    };

    if (polyData.type === 'event_group') {
      const event = polyData.data as EventGroup;
      if (event.match) {
        return <SportsMatchPage event={event} />;
      }

      // Detect crypto Up/Down series (hourly, 4h, etc.) and route to LiveMarketPage
      if (isCryptoUpDownEvent(event)) {
        const allClosed = event.markets.every(m => m.closed);
        const timeWindows = buildTimeWindows(event.slug, event.end_date_iso, allClosed);
        const enrichedEvent: EventGroup = {
          ...event,
          time_windows: timeWindows,
          live: event.end_date_iso ? new Date(event.end_date_iso).getTime() > now : false,
        };
        return <LiveMarketPage event={enrichedEvent} />;
      }

      return <MultiOutcomeEventPage event={event} relatedEvents={related} />;
    }

    // Detect series events (e.g., btc-updown-5m-1773072000) and route to LiveMarketPage
    const isSeriesEvent = /^(btc|eth|sol|xrp|doge)-updown-\d+m?-\d+$/.test(slug);
    if (isSeriesEvent) {
      const market = polyData.data as Market;
      const timeWindows = buildTimeWindows(market.slug, market.end_date_iso, market.closed);

      // Convert Market → EventGroup for LiveMarketPage
      const eventGroup: EventGroup = {
        id: market.id,
        title: market.question,
        slug: market.slug,
        description: market.description,
        category: market.category,
        tags: market.tags,
        image_url: market.image_url,
        end_date_iso: market.end_date_iso,
        volume: market.volume,
        liquidity: market.liquidity,
        created_at: market.created_at,
        markets: [market],
        live: market.end_date_iso ? new Date(market.end_date_iso).getTime() > now : false,
        time_windows: timeWindows,
      };
      return <LiveMarketPage event={eventGroup} />;
    }

    return <SingleMarketPage market={polyData.data as Market} relatedEvents={related} />;
  }

  // Backend API or dummy data
  const market = apiMarket ?? getMarketBySlug(slug);

  if ((polyLoading || apiLoading) && !market) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 text-center" style={{ paddingTop: 80, paddingBottom: 80, color: 'var(--text-muted)', fontSize: 14 }}>
        Loading market...
      </div>
    );
  }

  if (!market) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 text-center" style={{ paddingTop: 80, paddingBottom: 80, color: 'var(--text-muted)', fontSize: 14 }}>
        Market not found
      </div>
    );
  }

  return <SingleMarketPage market={market} />;
}
// force rebuild 1773590330
