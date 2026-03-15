'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { EventGroup } from '@/lib/types';
import TradePanel from '@/components/trade/TradePanel';
import OutcomeDropdown from '@/components/trade/OutcomeDropdown';
import { useLivePrices, extractTokenIds } from '@/hooks/useLivePrices';

/* ── Types ── */

interface TaxonomyLeague { slug: string; label: string; count: number; volume?: number }
interface TaxonomyItem { slug: string; label: string; count: number; volume?: number; leagues: TaxonomyLeague[] }

interface PageResponse {
  events: EventGroup[];
  hasMore: boolean;
  total: number;
  taxonomy?: TaxonomyItem[];
  topLeagueOrder?: string[];
}

/* ── Helpers ── */

function fmtVol(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
  return `$${vol.toFixed(0)}`;
}

function formatDateLabel(dateKey: string): string {
  const date = new Date(dateKey + 'T12:00:00');
  const today = new Date();
  const todayKey = today.toLocaleDateString('en-CA');
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toLocaleDateString('en-CA');

  if (dateKey === todayKey) return 'Today';
  if (dateKey === tomorrowKey) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
  'ncaa-basketball': 'NCAAB',
  'ncaa-cbb': 'NCAAB',
  'table-tennis': 'Table Tennis',
  'ping-pong': 'Table Tennis',
  'la-liga': 'La Liga',
  'bundesliga': 'Bundesliga',
  'bundesliga-2': '2. Bundesliga',
  'serie-a': 'Serie A',
  'serie-b': 'Serie B',
  'ligue-1': 'Ligue 1',
  'ligue-2': 'Ligue 2',
  'efl-championship': 'EFL Championship',
  'epl': 'EPL',
  'premier-league': 'EPL',
  'rus': 'Russian Premier League',
  'tur': 'Süper Lig',
  'shl': 'SHL',
  'khl': 'KHL',
  'arg': 'Argentina Primera División',
  'brazil-serie-a': 'Brazil Serie A',
  'japan-j2-league': 'Japan J2 League',
  'chinese-super-league': 'Chinese Super League',
  'rugby-six-nations': 'Six Nations',
  'international-cricket': 'International Cricket',
};

/* ── League logo PNGs (scraped from Polymarket) ── */
const LEAGUE_LOGO: Record<string, string> = {
  // Basketball
  nba: '/images/sports/nba.png', ncaab: '/images/sports/cbb.png', 'march-madness': '/images/sports/cbb.png',
  'nba-playoffs': '/images/sports/nba.png', 'nba-finals': '/images/sports/nba.png', wnba: '/images/sports/nba.png',
  basketball: '/images/sports/nba.png',
  // Soccer
  epl: '/images/sports/epl.png', 'premier-league': '/images/sports/epl.png',
  'la-liga': '/images/sports/laliga.png', 'serie-a': '/images/sports/sea.png',
  mls: '/images/sports/mls.png', ucl: '/images/sports/ucl.png', 'champions-league': '/images/sports/ucl.png',
  soccer: '/images/sports/soccer.png',
  // Hockey
  nhl: '/images/sports/nhl.png', 'nhl-playoffs': '/images/sports/nhl.png',
  hockey: '/images/sports/nhl.png',
  // Esports
  esports: '/images/sports/esports.png',
  'counter-strike-2': '/images/sports/cs2.png',
  'league-of-legends': '/images/sports/lol.png',
  'dota-2': '/images/sports/dota2.png',
  valorant: '/images/sports/valorant.png',
  'call-of-duty': '/images/sports/cod.png',
  'honor-of-kings': '/images/sports/hok.png',
  overwatch: '/images/sports/overwatch.png',
  // Football
  nfl: '/images/sports/nfl.png', 'nfl-playoffs': '/images/sports/nfl.png',
  'super-bowl': '/images/sports/nfl.png', football: '/images/sports/football.png',
  // Others
  ufc: '/images/sports/ufc.png', boxing: '/images/sports/boxing.png',
  golf: '/images/sports/golf.png', pga: '/images/sports/golf.png',
  f1: '/images/sports/f1.png', 'formula-1': '/images/sports/f1.png',
  chess: '/images/sports/chess.png', pickleball: '/images/sports/pickleball.png',
  mlb: '/images/sports/mlb.png', baseball: '/images/sports/mlb.png',
  tennis: '/images/sports/tennis.png', atp: '/images/sports/tennis.png', wta: '/images/sports/tennis.png',
  cricket: '/images/sports/cricket.png', ipl: '/images/sports/cricket.png',
  rugby: '/images/sports/boxing.png', 'six-nations': '/images/sports/boxing.png',
};

function LeagueIcon({ slug, size = 16 }: { slug: string; size?: number }) {
  const logo = LEAGUE_LOGO[slug];
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover' }}
        loading="eager"
      />
    );
  }
  return <SportIcon slug={slug} size={size} />;
}

/* ── SVG Sport Icons ── */
const SPORT_PARENT: Record<string, string> = {
  nba: 'basketball', ncaab: 'basketball', nbl: 'basketball', cba: 'basketball',
  'liga-endesa': 'basketball', euroleague: 'basketball', 'pro-a': 'basketball',
  kbl: 'basketball', lnb: 'basketball', wnba: 'basketball', 'march-madness': 'basketball',
  'nba-playoffs': 'basketball', 'nba-finals': 'basketball',
  nhl: 'hockey', khl: 'hockey', ahl: 'hockey', del: 'hockey', shl: 'hockey', 'nhl-playoffs': 'hockey',
  ucl: 'soccer', epl: 'soccer', 'la-liga': 'soccer', 'serie-a': 'soccer',
  bundesliga: 'soccer', 'ligue-1': 'soccer', mls: 'soccer', 'premier-league': 'soccer',
  'champions-league': 'soccer', 'europa-league': 'soccer', 'liga-mx': 'soccer',
  'copa-america': 'soccer', euros: 'soccer', 'world-cup': 'soccer',
  'saudi-pro-league': 'soccer', concacaf: 'soccer',
  'counter-strike-2': 'esports', 'league-of-legends': 'esports', 'dota-2': 'esports',
  valorant: 'esports', 'honor-of-kings': 'esports', 'rainbow-six': 'esports',
  'call-of-duty': 'esports', overwatch: 'esports', 'rocket-league': 'esports',
  atp: 'tennis', wta: 'tennis', 'us-open': 'tennis', wimbledon: 'tennis',
  'french-open': 'tennis', 'australian-open': 'tennis',
  ipl: 'cricket', 't20-world-cup': 'cricket', 'the-ashes': 'cricket',
  mlb: 'baseball', npb: 'baseball',
  nfl: 'football', ncaaf: 'football', xfl: 'football', 'nfl-playoffs': 'football', 'super-bowl': 'football',
  'six-nations': 'rugby', 'rugby-world-cup': 'rugby', 'super-rugby': 'rugby',
  pga: 'golf', masters: 'golf', 'us-open-golf': 'golf', 'the-open': 'golf',
  'formula-1': 'f1', 'f1-race': 'f1',
};

function SportIcon({ slug, size = 16 }: { slug: string; size?: number }) {
  const sport = SPORT_PARENT[slug] || slug;
  const s = size;
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (sport) {
    case 'basketball':
      return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3.5 7.5C6 10 9 12 12 12s6-2 8.5-4.5"/><path d="M3.5 16.5C6 14 9 12 12 12s6 2 8.5 4.5"/></svg>);
    case 'soccer':
      return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 3l2.5 4.5h5L16 12l3.5 4.5h-5L12 21l-2.5-4.5h-5L8 12 4.5 7.5h5z"/></svg>);
    case 'hockey':
      return (<svg {...props}><path d="M4 20c0-2 2-3 4-3h8c2 0 4 1 4 3"/><path d="M12 17V4"/><circle cx="12" cy="4" r="2" fill="currentColor" stroke="none"/></svg>);
    case 'esports':
      return (<svg {...props}><rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 18l-1 2"/><path d="M15 18l1 2"/></svg>);
    case 'tennis':
      return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M5 3c2.5 4 2.5 14 0 18"/><path d="M19 3c-2.5 4-2.5 14 0 18"/></svg>);
    case 'cricket':
      return (<svg {...props}><path d="M5 19L16 8"/><circle cx="18" cy="6" r="2"/><path d="M3 21l2-2"/><path d="M14 10l-2 2"/></svg>);
    case 'baseball':
      return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M6.3 4.2c1.5 2.5 1.5 5.5.5 8s-3 4.5-5 5.5"/><path d="M17.7 19.8c-1.5-2.5-1.5-5.5-.5-8s3-4.5 5-5.5"/></svg>);
    case 'football':
      return (<svg {...props}><ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-30 12 12)"/><path d="M12 8v8"/><path d="M9 9.5l3 1.5 3-1.5"/><path d="M9 14.5l3-1.5 3 1.5"/></svg>);
    case 'rugby':
      return (<svg {...props}><ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-30 12 12)"/><path d="M12 7v10"/></svg>);
    case 'ufc':
    case 'boxing':
      return (<svg {...props}><path d="M18 5h-2a4 4 0 0 0-4 4v2"/><path d="M6 5h2a4 4 0 0 1 4 4v2"/><path d="M6 5V4"/><path d="M18 5V4"/><rect x="5" y="11" width="14" height="9" rx="4"/></svg>);
    case 'golf':
      return (<svg {...props}><path d="M12 18V3"/><path d="M12 3l7 4-7 4"/><circle cx="12" cy="20" r="2" fill="currentColor" stroke="none"/></svg>);
    case 'f1':
      return (<svg {...props}><path d="M4 20V4h4l-2 8h6l2-8h4v16"/><path d="M4 12h16"/></svg>);
    case 'chess':
      return (<svg {...props}><path d="M9 2h6v3l-2 1v3h2l2 5H7l2-5h2V6L9 5z"/><path d="M7 14v2c0 1 1 2 2 2h6c1 0 2-1 2-2v-2"/><path d="M6 18h12v2H6z"/></svg>);
    case 'table-tennis':
    case 'pickleball':
      return (<svg {...props}><circle cx="10" cy="10" r="7"/><path d="M15 15l5 5"/><circle cx="19" cy="5" r="2" fill="currentColor" stroke="none"/></svg>);
    case 'lacrosse':
      return (<svg {...props}><path d="M6 20L18 4"/><path d="M18 4c-2 0-4 1-5 3s-1 4.5 0 6"/><circle cx="7" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>);
    default:
      return (<svg {...props}><circle cx="12" cy="8" r="5"/><path d="M12 13v3"/><path d="M8 21h8"/><path d="M12 16l-4 5"/><path d="M12 16l4 5"/></svg>);
  }
}

function LiveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.9 19.1A10 10 0 0 1 2 12c0-2.8 1.1-5.3 2.9-7.1"/>
      <path d="M8.1 15.9A5 5 0 0 1 7 12c0-1.4.6-2.7 1.5-3.5"/>
      <path d="M15.9 15.9A5 5 0 0 0 17 12c0-1.4-.6-2.7-1.5-3.5"/>
      <path d="M19.1 19.1A10 10 0 0 0 22 12c0-2.8-1.1-5.3-2.9-7.1"/>
      <circle cx="12" cy="12" r="1" fill="currentColor"/>
    </svg>
  );
}

function FuturesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>
      <path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>
      <path d="M8 18h.01"/><path d="M12 18h.01"/>
    </svg>
  );
}

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
  livePrices?: Record<string, { bid: number; ask: number; mid: number }>;
}) {
  const m = event.match!;
  const t1 = m.team1;
  const t2 = m.team2;

  const ml = m.market_types.find((mt) => mt.label === 'Moneyline' || mt.label === 'Winner' || mt.label === 'Match Winner') ?? m.market_types[0];

  // Use live CLOB prices if available, otherwise fall back to stored prices
  // Returns { price, noLiquidity } — noLiquidity means bid=0 & ask=0 (settled/dead market)
  const getLivePriceData = (marketTypeMarket: { id?: string; price: number }, fallback: number): { price: number; noLiquidity: boolean } => {
    if (!livePrices || !marketTypeMarket?.id) return { price: fallback, noLiquidity: false };
    const baseId = marketTypeMarket.id.replace(/-\d+$/, '');
    const mkt = event.markets.find(m => m.id === baseId);
    if (mkt) {
      const yesToken = mkt.tokens.find(t => t.outcome === 'Yes');
      if (yesToken && livePrices[yesToken.token_id]) {
        const live = livePrices[yesToken.token_id];
        return { price: live.mid, noLiquidity: live.bid === 0 && live.ask === 0 };
      }
    }
    return { price: fallback, noLiquidity: false };
  };

  const t1Data = getLivePriceData(ml?.markets[0], ml?.markets[0]?.price ?? 0);
  const t1Price = t1Data.price;
  // Only use 1-Yes formula when there's actual liquidity; when bid=0 & ask=0, both sides are ~0
  const t2Price = t1Data.noLiquidity ? 0 : (1 - t1Price);
  const is3Way = ml && ml.markets.length >= 3;
  const drawPrice = is3Way ? getLivePriceData(ml.markets[2], ml.markets[2]?.price ?? 0).price : 0;

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

  const leagueName = m.league;
  // Build game time label: "2H · 64:00", "P3 · 08:41", "ENDED"
  const gameTimeLabel = (() => {
    if (m.ended || m.status === 'final') return 'ENDED';
    if (m.status === 'live') {
      const parts: string[] = [];
      if (m.period) parts.push(m.period);
      if (m.elapsed) parts.push(m.elapsed);
      if (parts.length > 0) return parts.join(' · ');
      return m.status_detail || '';
    }
    return m.status_detail || new Date(m.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  })();
  const statusLabel = gameTimeLabel;
  // Use Polymarket's event image as the league/tournament logo
  const leagueLogo = m.event_image || event.image_url || '';

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
              {gameTimeLabel && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{gameTimeLabel}</span>}
            </>
          )}
          {m.ended && (
            <>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>ENDED</span>
            </>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
            background: 'var(--bg-surface)', borderRadius: 6, padding: '3px 10px',
            whiteSpace: 'nowrap',
          }}>
            {leagueLogo && (
              <img
                src={leagueLogo}
                alt=""
                width={18}
                height={18}
                style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
                loading="eager"
              />
            )}
            {statusLabel ? `${leagueName} \u00b7 ${statusLabel}` : leagueName}
          </span>
          <span style={{
            fontSize: 14, color: 'var(--text-muted)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {fmtVol(event.volume)} Vol.
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
                    <img src={team.logo} alt={team.abbr} loading="lazy" style={{ width: 32, height: 32, objectFit: 'contain' }}
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
            <img src={event.image_url} alt="" loading="lazy" style={{
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
  initialTopLeagueOrder?: string[];
}

export default function SportsClient({ initialEvents, initialTaxonomy, initialHasMore, initialTotal, initialTopLeagueOrder }: SportsClientProps) {
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
  const [topLeagueOrder, setTopLeagueOrder] = useState<string[] | null>(initialTopLeagueOrder || null);
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
        if (data.taxonomy) { setTaxonomy(data.taxonomy); if (data.topLeagueOrder) setTopLeagueOrder(data.topLeagueOrder); }
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

  /* ── No mount taxonomy refresh needed — page is force-dynamic, server always returns fresh data ── */

  /* ── Reset & fetch first page when filters change ── */
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      // If we have server-side data, skip the initial fetch
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
            if (data.taxonomy) { setTaxonomy(data.taxonomy); if (data.topLeagueOrder) setTopLeagueOrder(data.topLeagueOrder); }
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

  /* ── Get parent sport for an event ── */
  const getSportForEvent = useCallback((eg: EventGroup): string => {
    const slugs = (eg.tags || []).map(t => t.slug.toLowerCase());
    for (const s of slugs) {
      if (sportSlugs.has(s)) return s;
    }
    for (const sport of taxonomy) {
      for (const league of sport.leagues) {
        if (slugs.includes(league.slug)) return sport.slug;
      }
    }
    return 'sports';
  }, [sportSlugs, taxonomy]);

  /* ── Sport ordering from taxonomy (already sorted by volume) ── */
  const sportOrder = useMemo(() => {
    const order: Record<string, number> = {};
    taxonomy.forEach((sport, idx) => { order[sport.slug] = idx; });
    return order;
  }, [taxonomy]);

  /* ── Group matches: by LEAGUE on main view (like Polymarket), by DATE when filtered ── */
  const isFiltered = !!activeFilter;
  const grouped: Record<string, EventGroup[]> = {};
  const groupLabels: Record<string, string> = {};

  // Extract league key directly from event tags (like Polymarket grouping)
  const GENERIC_TAG_SET = new Set(['sports', 'esports', 'games']);
  const SPORT_PARENT_SET = new Set(['soccer', 'cricket', 'rugby', 'tennis', 'hockey', 'baseball', 'basketball', 'american-football', 'mma', 'boxing', 'golf', 'formula-1', 'nascar', 'table-tennis', 'football']);
  const getLeagueKey = (eg: EventGroup): { slug: string; label: string } => {
    const tags = eg.tags || [];
    // Find the most specific tag: not generic, not broad sport category
    for (const t of tags) {
      const s = t.slug.toLowerCase();
      if (!GENERIC_TAG_SET.has(s) && !SPORT_PARENT_SET.has(s)) {
        return { slug: s, label: LABEL_OVERRIDES[s] || labelMap[s] || t.label || s };
      }
    }
    // Fall back: use the sport-level tag (for esports: counter-strike-2, dota-2)
    for (const t of tags) {
      const s = t.slug.toLowerCase();
      if (!GENERIC_TAG_SET.has(s)) {
        return { slug: s, label: LABEL_OVERRIDES[s] || labelMap[s] || t.label || s };
      }
    }
    return { slug: 'other', label: eg.match?.league || 'Sports' };
  };

  if (viewTab === 'live') {
    displayEvents.forEach((eg) => {
      if (!eg.match) return;
      if (isFiltered) {
        // Filtered view: group by date
        const startTime = eg.match.start_time || eg.end_date_iso || eg.created_at;
        const dateKey = new Date(startTime).toLocaleDateString('en-CA');
        if (!grouped[dateKey]) { grouped[dateKey] = []; groupLabels[dateKey] = formatDateLabel(dateKey); }
        grouped[dateKey].push(eg);
      } else {
        // Main view: group by league (like Polymarket)
        const { slug, label } = getLeagueKey(eg);
        if (!grouped[slug]) { grouped[slug] = []; groupLabels[slug] = label; }
        grouped[slug].push(eg);
      }
    });
    if (isFiltered) {
      for (const key of Object.keys(grouped)) {
        grouped[key].sort((a, b) => {
          const aTime = new Date(a.match!.start_time || a.end_date_iso || '').getTime();
          const bTime = new Date(b.match!.start_time || b.end_date_iso || '').getTime();
          return aTime - bTime;
        });
      }
    }
    // Main view: preserve API response order within each league (matches Polymarket)
  }

  const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
    if (isFiltered) return a.localeCompare(b);
    // Sort league groups by total group volume DESC (like Polymarket)
    const aVol = (grouped[a] || []).reduce((sum, e) => sum + (e.volume || 0), 0);
    const bVol = (grouped[b] || []).reduce((sum, e) => sum + (e.volume || 0), 0);
    return bVol - aVol;
  });

  /* ── Top leagues for sidebar quick-access (auto-scraped from Polymarket, fallback to curated) ── */
  const sidebarSubLeagues = useMemo(() => {
    const FALLBACK_ORDER = ['nba', 'ncaa-basketball', 'ucl', 'nhl'];
    const order = topLeagueOrder && topLeagueOrder.length >= 2 ? topLeagueOrder : FALLBACK_ORDER;
    const leagueMap = new Map<string, { slug: string; label: string; count: number; volume: number; sport: string }>();
    for (const sport of taxonomy) {
      for (const league of sport.leagues) {
        leagueMap.set(league.slug, { slug: league.slug, label: league.label, count: league.count, volume: league.volume || 0, sport: sport.slug });
      }
    }
    const result: { slug: string; label: string; count: number; volume: number; sport: string }[] = [];
    for (const slug of order) {
      const league = leagueMap.get(slug);
      if (league && league.count > 0) result.push(league);
    }
    return result;
  }, [taxonomy, topLeagueOrder]);

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
    <div style={{ display: 'flex', gap: 24 }}>

          {/* ═══ LEFT SIDEBAR ═══ */}
          <aside className="hidden lg:block" style={{ width: 200, flexShrink: 0, paddingTop: 24 }}>
            <nav className="hide-scrollbar" style={{ position: 'sticky', top: 68, display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', paddingBottom: 24 }}>

              {/* ── Live ── */}
              <button onClick={() => { setViewTab('live'); setActiveFilter(null); }} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                fontSize: 15, fontWeight: 600, border: 'none',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                background: viewTab === 'live' && !activeFilter ? 'var(--bg-hover)' : 'transparent',
                color: viewTab === 'live' && !activeFilter ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
                <LiveIcon size={21} />
                Live
              </button>

              {/* ── Futures ── */}
              <button onClick={() => { setViewTab('futures'); setActiveFilter(null); }} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                fontSize: 15, fontWeight: 600, border: 'none',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                background: viewTab === 'futures' && !activeFilter ? 'var(--bg-hover)' : 'transparent',
                color: viewTab === 'futures' && !activeFilter ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
                <FuturesIcon size={21} />
                Futures
              </button>

              {/* ── ALL SPORTS ── */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', padding: '16px 12px 6px', textTransform: 'uppercase' }}>
                All Sports
              </div>

              {/* Top leagues (standalone, no expand — like Polymarket: NBA, NCAAB, UCL, NHL) */}
              {sidebarSubLeagues.slice(0, 4).map((league) => {
                const isActive = activeFilter?.type === 'league' && activeFilter.slug === league.slug;
                return (
                  <button
                    key={league.slug}
                    onClick={() => {
                      setViewTab('live');
                      if (isActive) setActiveFilter(null);
                      else setActiveFilter({ type: 'league', slug: league.slug, sport: league.sport });
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 8, width: '100%',
                      fontSize: 14, fontWeight: 500, border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      background: isActive ? 'var(--bg-hover)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><LeagueIcon slug={league.slug} size={21} /></span>
                      <span style={{ fontWeight: 600 }}>{LABEL_OVERRIDES[league.slug] || league.label}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{league.count}</span>
                  </button>
                );
              })}

              {/* Expandable sport categories */}
              {taxonomy.map((sport) => {
                const isActiveLeagueParent = activeFilter?.type === 'league' && activeFilter.sport === sport.slug;
                const isActiveSport = activeFilter?.type === 'sport' && activeFilter.slug === sport.slug;
                const isExpanded = expandedSports.has(sport.slug) || isActiveLeagueParent;
                const hasLeagues = sport.leagues.length > 0;

                return (
                  <div key={sport.slug}>
                    <button
                      onClick={() => {
                        if (hasLeagues) {
                          toggleExpand(sport.slug);
                        } else {
                          if (isActiveSport) setActiveFilter(null);
                          else { setViewTab('live'); setActiveFilter({ type: 'sport', slug: sport.slug }); }
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 8, width: '100%',
                        fontSize: 14, fontWeight: 500, border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        background: isActiveSport ? 'var(--bg-hover)' : 'transparent',
                        color: (isExpanded || isActiveSport || isActiveLeagueParent) ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SportIcon slug={sport.slug} size={21} /></span>
                        <span>{sport.label}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{sport.count}</span>
                        {hasLeagues && (
                          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                            style={{ color: 'var(--text-secondary)', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            <path d="M3 4.5L6 7.5L9 4.5" />
                          </svg>
                        )}
                      </span>
                    </button>

                    {isExpanded && hasLeagues && (
                      <div style={{ paddingLeft: 40, paddingBottom: 2 }}>
                        {sport.leagues.map((league) => {
                          const isActiveLeague = activeFilter?.type === 'league' && activeFilter.slug === league.slug;
                          return (
                            <button
                              key={league.slug}
                              onClick={() => {
                                setViewTab('live');
                                if (isActiveLeague) setActiveFilter(null);
                                else setActiveFilter({ type: 'league', slug: league.slug, sport: sport.slug });
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '5px 8px', borderRadius: 6, width: '100%',
                                fontSize: 13, fontWeight: 500, border: 'none',
                                cursor: 'pointer', textAlign: 'left',
                                background: isActiveLeague ? 'var(--bg-hover)' : 'transparent',
                                color: isActiveLeague ? 'var(--text-primary)' : 'var(--text-muted)',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><LeagueIcon slug={league.slug} size={18} /></span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {LABEL_OVERRIDES[league.slug] || league.label}
                                </span>
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
          <div style={{ flex: 1, minWidth: 0, paddingTop: 12, paddingBottom: 40 }}>
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

            {/* Mobile sport tabs (below lg) */}
            <div className="flex lg:hidden hide-scrollbar" style={{
              gap: 6, overflowX: 'auto', paddingBottom: 12,
              marginBottom: 4, borderBottom: '1px solid var(--border)',
            }}>
              {[
                { label: 'Live', active: viewTab === 'live' && !activeFilter, onClick: () => { setViewTab('live'); setActiveFilter(null); } },
                { label: 'Futures', active: viewTab === 'futures' && !activeFilter, onClick: () => { setViewTab('futures'); setActiveFilter(null); } },
                ...sidebarSubLeagues.map((l) => ({
                  label: LABEL_OVERRIDES[l.slug] || l.label,
                  active: activeFilter?.type === 'league' && activeFilter.slug === l.slug,
                  onClick: () => { setViewTab('live'); setActiveFilter({ type: 'league', slug: l.slug, sport: l.sport }); },
                })),
                ...taxonomy.map((s) => ({
                  label: s.label,
                  active: activeFilter?.type === 'sport' && activeFilter.slug === s.slug,
                  onClick: () => { setViewTab('live'); setActiveFilter({ type: 'sport', slug: s.slug }); },
                })),
              ].map((tab, i) => (
                <button key={i} onClick={tab.onClick} style={{
                  padding: '6px 14px', borderRadius: 999, whiteSpace: 'nowrap',
                  fontSize: 13, fontWeight: 600, border: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: tab.active ? 'var(--text-primary)' : 'transparent',
                  color: tab.active ? 'var(--bg)' : 'var(--text-secondary)',
                }}>
                  {tab.label}
                </button>
              ))}
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
                {sortedGroupKeys.map((key) => {
                  const groupEvents = grouped[key];
                  const label = groupLabels[key] || key;
                  const hasLive = groupEvents.some(e => e.match?.status === 'live');
                  return (
                    <div key={key} style={{ marginBottom: 16 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 8, paddingBottom: 8,
                        borderBottom: '1px solid var(--border)',
                      }}>
                        {!isFiltered && (
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sportColor(key), flexShrink: 0 }} />
                        )}
                        {isFiltered && hasLive && (
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.18px' }}>
                          {label}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                          {groupEvents.length}
                        </span>
                      </div>
                      {groupEvents.map((event) => (
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
          <div className="hidden lg:block" style={{ width: 372, flexShrink: 0, paddingTop: 12 }}>
            {sel && selMatch && sel.markets?.[0] ? (() => {
              const rawTradeMarket = sel.markets.find(m => m.id === selectedMarketId) ?? sel.markets[0];
              // Merge live prices into trade market tokens so TradePanel stays in sync
              // Find live Yes price, derive No price as complement
              const yesToken = rawTradeMarket.tokens.find(t => t.outcome === 'Yes');
              const liveYes = yesToken ? livePrices[yesToken.token_id] : null;
              // When bid=0 & ask=0, market has no liquidity (settled/dead) — don't use 1-mid formula
              const yesNoLiquidity = liveYes != null && liveYes.bid === 0 && liveYes.ask === 0;
              const tradeMarket = {
                ...rawTradeMarket,
                tokens: rawTradeMarket.tokens.map(t => {
                  if (t.outcome === 'Yes' && liveYes?.mid != null) return { ...t, price: liveYes.mid };
                  if (t.outcome === 'No' && liveYes?.mid != null) return { ...t, price: yesNoLiquidity ? 0 : 1 - liveYes.mid };
                  return t;
                }),
              };
              return (
                <div style={{ position: 'sticky', top: 68 }}>
                  <div className="rounded-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <OutcomeDropdown
                      markets={sel.markets.map(m => {
                        const yt = m.tokens.find(t => t.outcome === 'Yes');
                        const ly = yt ? livePrices[yt.token_id] : null;
                        const noLiq = ly != null && ly.bid === 0 && ly.ask === 0;
                        return { ...m, tokens: m.tokens.map(t => {
                          if (t.outcome === 'Yes' && ly?.mid != null) return { ...t, price: ly.mid };
                          if (t.outcome === 'No' && ly?.mid != null) return { ...t, price: noLiq ? 0 : 1 - ly.mid };
                          return t;
                        })};
                      })}
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
