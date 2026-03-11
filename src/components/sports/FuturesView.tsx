'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Market } from '@/lib/types';

// Re-declare FuturesMarketData locally (no longer importing from polymarketApi)
export interface FuturesOutcome {
  name: string;
  pct: number;
  logo?: string;
  polymarket_token_id?: string;
}

export interface FuturesMarketData {
  id: string;
  title: string;
  slug: string;
  variant: 'bar' | 'list';
  defaultShow: number;
  outcomes: FuturesOutcome[];
  polymarket_slug?: string;
}

// ── Constants ──

const BAR_COLORS = [
  '#1452f0', '#2a9d8f', '#f59e0b', '#22c55e', '#ef4444',
  '#ec4899', '#8b5cf6', '#6366f1', '#06b6d4', '#f97316',
];

const LEAGUE_PILLS = [
  { id: 'nba', label: 'NBA', polyTag: 'nba' },
  { id: 'epl', label: 'EPL', polyTag: 'epl' },
  { id: 'nfl', label: 'NFL', polyTag: 'nfl' },
];

// ── NBA Logo helper ──

function nbaLogo(teamId: number) {
  return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
}

// ── NBA Dummy Data (fallback when API unavailable) ──
// Matches Polymarket "NBA Futures" screenshot

const NBA_FUTURES: FuturesMarketData[] = [
  {
    id: 'nba-champion',
    title: 'NBA Champion',
    slug: 'nba-champion-2025-26',
    variant: 'bar',
    defaultShow: 8,
    polymarket_slug: 'nba-championship-winner-2024-2025',
    outcomes: [
      { name: 'Oklahoma City Thunder', pct: 36, logo: nbaLogo(1610612760) },
      { name: 'San Antonio Spurs', pct: 14, logo: nbaLogo(1610612759) },
      { name: 'Denver Nuggets', pct: 11, logo: nbaLogo(1610612743) },
      { name: 'Boston Celtics', pct: 10, logo: nbaLogo(1610612738) },
      { name: 'Cleveland Cavaliers', pct: 6, logo: nbaLogo(1610612739) },
      { name: 'Detroit Pistons', pct: 5, logo: nbaLogo(1610612765) },
      { name: 'New York Knicks', pct: 5, logo: nbaLogo(1610612752) },
      { name: 'Minnesota Timberwolves', pct: 3, logo: nbaLogo(1610612750) },
      { name: 'Houston Rockets', pct: 2, logo: nbaLogo(1610612745) },
      { name: 'Los Angeles Lakers', pct: 2, logo: nbaLogo(1610612747) },
      { name: 'Charlotte Hornets', pct: 1, logo: nbaLogo(1610612766) },
      { name: 'Los Angeles Clippers', pct: 1, logo: nbaLogo(1610612746) },
      { name: 'Toronto Raptors', pct: 1, logo: nbaLogo(1610612761) },
      { name: 'Miami Heat', pct: 1, logo: nbaLogo(1610612748) },
      { name: 'Philadelphia 76ers', pct: 1, logo: nbaLogo(1610612755) },
      { name: 'Phoenix Suns', pct: 0, logo: nbaLogo(1610612756) },
      { name: 'Golden State Warriors', pct: 0, logo: nbaLogo(1610612744) },
      { name: 'Orlando Magic', pct: 0, logo: nbaLogo(1610612753) },
      { name: 'Portland Trail Blazers', pct: 0, logo: nbaLogo(1610612757) },
      { name: 'Atlanta Hawks', pct: 0, logo: nbaLogo(1610612737) },
      { name: 'New Orleans Pelicans', pct: 0, logo: nbaLogo(1610612740) },
      { name: 'Chicago Bulls', pct: 0, logo: nbaLogo(1610612741) },
      { name: 'Milwaukee Bucks', pct: 0, logo: nbaLogo(1610612749) },
      { name: 'Memphis Grizzlies', pct: 0, logo: nbaLogo(1610612763) },
      { name: 'Utah Jazz', pct: 0, logo: nbaLogo(1610612762) },
      { name: 'Indiana Pacers', pct: 0, logo: nbaLogo(1610612754) },
      { name: 'Dallas Mavericks', pct: 0, logo: nbaLogo(1610612742) },
      { name: 'Brooklyn Nets', pct: 0, logo: nbaLogo(1610612751) },
      { name: 'Sacramento Kings', pct: 0, logo: nbaLogo(1610612758) },
      { name: 'Washington Wizards', pct: 0, logo: nbaLogo(1610612764) },
    ],
  },
  {
    id: 'nba-mvp',
    title: 'NBA MVP',
    slug: 'nba-mvp-2025-26',
    variant: 'list',
    defaultShow: 5,
    polymarket_slug: 'nba-mvp-2024-2025',
    outcomes: [
      { name: 'Shai Gilgeous-Alexander', pct: 77 },
      { name: 'Nikola Jokic', pct: 10 },
      { name: 'Cade Cunningham', pct: 5 },
      { name: 'Victor Wembanyama', pct: 5 },
      { name: 'Luka Doncic', pct: 1 },
    ],
  },
  {
    id: 'nba-roty',
    title: 'Rookie of the Year',
    slug: 'nba-roty-2025-26',
    variant: 'list',
    defaultShow: 5,
    polymarket_slug: 'nba-rookie-of-the-year-2024-2025',
    outcomes: [
      { name: 'Kon Knueppel', pct: 63 },
      { name: 'Cooper Flagg', pct: 37 },
      { name: 'V.J. Edgecombe', pct: 0 },
      { name: 'Dylan Harper', pct: 0 },
      { name: 'Tre Johnson', pct: 0 },
    ],
  },
  {
    id: 'nba-cup-winner',
    title: 'NBA Cup Winner',
    slug: 'nba-cup-winner-2025-26',
    variant: 'list',
    defaultShow: 5,
    polymarket_slug: 'nba-cup-winner-2024-2025',
    outcomes: [
      { name: 'New York Knicks', pct: 100 },
      { name: 'Atlanta Hawks', pct: 0 },
      { name: 'Boston Celtics', pct: 0 },
      { name: 'Brooklyn Nets', pct: 0 },
      { name: 'Charlotte Hornets', pct: 0 },
    ],
  },
  {
    id: 'nba-eastern-conf',
    title: 'Eastern Conference Champion',
    slug: 'nba-eastern-conf-2025-26',
    variant: 'bar',
    defaultShow: 5,
    polymarket_slug: 'nba-eastern-conference-winner-2024-2025',
    outcomes: [
      { name: 'Boston Celtics', pct: 29, logo: nbaLogo(1610612738) },
      { name: 'Cleveland Cavaliers', pct: 25, logo: nbaLogo(1610612739) },
      { name: 'New York Knicks', pct: 17, logo: nbaLogo(1610612752) },
      { name: 'Detroit Pistons', pct: 16, logo: nbaLogo(1610612765) },
      { name: 'Charlotte Hornets', pct: 6, logo: nbaLogo(1610612766) },
    ],
  },
  {
    id: 'nba-western-conf',
    title: 'Western Conference Champion',
    slug: 'nba-western-conf-2025-26',
    variant: 'bar',
    defaultShow: 5,
    polymarket_slug: 'nba-western-conference-winner-2024-2025',
    outcomes: [
      { name: 'Oklahoma City Thunder', pct: 49, logo: nbaLogo(1610612760) },
      { name: 'San Antonio Spurs', pct: 19, logo: nbaLogo(1610612759) },
      { name: 'Denver Nuggets', pct: 13, logo: nbaLogo(1610612743) },
      { name: 'Minnesota Timberwolves', pct: 6, logo: nbaLogo(1610612750) },
      { name: 'Los Angeles Lakers', pct: 5, logo: nbaLogo(1610612747) },
    ],
  },
];

// ── Card Components ──

function FuturesBarCard({
  market,
  onNavigate,
}: {
  market: FuturesMarketData;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? market.outcomes
    : market.outcomes.slice(0, market.defaultShow);
  const maxPct = Math.max(...visible.map((o) => o.pct), 1);

  return (
    <div
      className="futures-card card-hover"
      onClick={onNavigate}
      style={{
        borderRadius: 12,
        padding: '20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 16px',
        }}
      >
        {market.title}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {visible.map((outcome, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 36,
            }}
          >
            {/* Team logo */}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                flexShrink: 0,
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {outcome.logo ? (
                <img
                  src={outcome.logo}
                  alt=""
                  style={{ width: 20, height: 20, objectFit: 'contain' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <span
                  style={{
                    fontSize: 7,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}
                >
                  {outcome.name
                    .split(' ')
                    .pop()
                    ?.slice(0, 3)
                    .toUpperCase()}
                </span>
              )}
            </div>

            {/* Name */}
            <span
              style={{
                width: 130,
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {outcome.name}
            </span>

            {/* Percentage */}
            <span
              style={{
                width: 36,
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                textAlign: 'right',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {outcome.pct}%
            </span>

            {/* Bar */}
            <div
              style={{
                flex: 1,
                height: 20,
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width:
                    outcome.pct > 0
                      ? `${(outcome.pct / maxPct) * 100}%`
                      : '0%',
                  height: '100%',
                  borderRadius: 4,
                  background: BAR_COLORS[i % BAR_COLORS.length],
                  transition: 'width 0.6s ease-out',
                  minWidth: outcome.pct > 0 ? 4 : 0,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Show More */}
      {market.outcomes.length > market.defaultShow && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 12,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            padding: 0,
          }}
        >
          {expanded ? 'Show Less' : 'Show More'}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
      )}
    </div>
  );
}

function FuturesListCard({
  market,
  onNavigate,
}: {
  market: FuturesMarketData;
  onNavigate: () => void;
}) {
  return (
    <div
      className="futures-card card-hover"
      onClick={onNavigate}
      style={{
        borderRadius: 12,
        padding: '20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 4px',
        }}
      >
        {market.title}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {market.outcomes.slice(0, market.defaultShow).map((outcome, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 0',
              borderBottom:
                i < market.defaultShow - 1
                  ? '1px solid var(--border)'
                  : 'none',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginRight: 12,
              }}
            >
              {outcome.name}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {outcome.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main FuturesView ──

interface FuturesViewProps {
  activeSport?: string | null;
}

export default function FuturesView({ activeSport }: FuturesViewProps) {
  const router = useRouter();
  const [activeLeague, setActiveLeague] = useState('nba');
  const [liveData, setLiveData] = useState<FuturesMarketData[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync activeLeague with sidebar sport selection
  useEffect(() => {
    if (activeSport === 'nba') setActiveLeague('nba');
    else if (activeSport === 'soccer') setActiveLeague('epl');
    else if (activeSport === 'football') setActiveLeague('nfl');
  }, [activeSport]);

  // Fetch from our API route (has CLOB prices, placeholder filtering, volume sync, sort order)
  const fetchFuturesData = useCallback(async (league: string) => {
    setLoading(true);
    try {
      const pill = LEAGUE_PILLS.find((p) => p.id === league);
      if (!pill) throw new Error('Unknown league');

      const res = await fetch(`/api/polymarket/events?tag=${pill.polyTag}&limit=20`);
      if (!res.ok) throw new Error('API error');
      const markets: Market[] = await res.json();

      if (markets.length > 0) {
        // Transform Market[] to FuturesMarketData[]
        const transformed: FuturesMarketData[] = markets
          .filter(m => m.tokens.length > 2) // only multi-outcome events
          .map(m => ({
            id: `pm-${m.id}`,
            title: m.question,
            slug: m.slug,
            variant: (m.tokens.length > 5 ? 'bar' : 'list') as 'bar' | 'list',
            defaultShow: m.tokens.length > 10 ? 8 : 5,
            polymarket_slug: m.slug,
            outcomes: m.tokens.map(t => ({
              name: t.label || t.outcome,
              pct: Math.round(t.price * 100),
              polymarket_token_id: t.token_id,
            })),
          }));
        setLiveData(transformed.length > 0 ? transformed : null);
      } else {
        setLiveData(null);
      }
    } catch {
      // Silently fall back to dummy data
      setLiveData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFuturesData(activeLeague);
  }, [activeLeague, fetchFuturesData]);

  // Use live data if available, otherwise dummy
  const markets = liveData || (activeLeague === 'nba' ? NBA_FUTURES : []);

  // Split into layout sections
  const championMarket = markets.find(
    (m) =>
      m.id === 'nba-champion' ||
      m.title.toLowerCase().includes('champion') &&
        !m.title.toLowerCase().includes('conference'),
  );
  const listMarkets = markets.filter((m) => m.variant === 'list');
  const conferenceMarkets = markets.filter(
    (m) =>
      m.variant === 'bar' &&
      m !== championMarket,
  );

  const navigate = (slug: string) => router.push(`/event/${slug}`);
  const hasData = markets.length > 0;

  return (
    <div>
      {/* League pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {LEAGUE_PILLS.map((league) => (
          <button
            key={league.id}
            onClick={() => setActiveLeague(league.id)}
            style={{
              padding: '6px 16px',
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background:
                activeLeague === league.id
                  ? 'var(--brand-blue)'
                  : 'var(--bg-surface)',
              color: activeLeague === league.id ? '#fff' : 'var(--text-secondary)',
              transition: 'background .15s, color .15s',
            }}
          >
            {league.label}
          </button>
        ))}
      </div>

      {loading && (
        <div
          style={{
            padding: '48px 0',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--text-muted)',
          }}
        >
          Loading futures...
        </div>
      )}

      {!loading && !hasData && (
        <div
          style={{
            padding: '48px 0',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--text-muted)',
          }}
        >
          {activeLeague === 'nba'
            ? 'No NBA futures available'
            : `${activeLeague.toUpperCase()} futures coming soon`}
        </div>
      )}

      {!loading && hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Champion card - full width */}
          {championMarket && (
            <FuturesBarCard
              market={championMarket}
              onNavigate={() => navigate(championMarket.slug)}
            />
          )}

          {/* Three list cards in a row */}
          {listMarkets.length > 0 && (
            <div className="futures-grid-3">
              {listMarkets.map((m) => (
                <FuturesListCard
                  key={m.id}
                  market={m}
                  onNavigate={() => navigate(m.slug)}
                />
              ))}
            </div>
          )}

          {/* Conference champion cards */}
          {conferenceMarkets.length > 0 && (
            <div className="futures-grid-2">
              {conferenceMarkets.map((m) => (
                <FuturesBarCard
                  key={m.id}
                  market={m}
                  onNavigate={() => navigate(m.slug)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
