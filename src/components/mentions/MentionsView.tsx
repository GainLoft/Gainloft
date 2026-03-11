'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Market } from '@/lib/types';

// ── Types ──

interface MentionOutcome {
  name: string;
  pct: number;
}

interface MentionCard {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  dateLabel: string;   // "8 Mar", "TBD"
  dateDay: string;     // "8", "TBD"
  dateMonth: string;   // "Mar", ""
  timeLabel: string;   // "Sun, 9:30 AM"
  volume: number;
  isLive: boolean;
  isNew: boolean;
  outcomes: MentionOutcome[];
  moreCount: number;   // "+18"
  tags: string[];
}

// ── Helpers ──

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${v.toLocaleString('en-US')} Vol.`;
  return `$${v} Vol.`;
}

// ── Dummy data matching the Polymarket PDF ──

const MENTION_CARDS: MentionCard[] = [
  {
    id: 'mn1', slug: 'ufc-mentions-holloway-oliveira-2', title: 'UFC Mentions: Holloway vs. Oliveira 2',
    image: null, dateDay: '8', dateMonth: 'Mar', dateLabel: '8 Mar',
    timeLabel: 'Sun, 9:30 AM', volume: 39_172, isLive: true, isNew: false,
    outcomes: [{ name: 'Holloway / Oliveira 15+ times', pct: 62 }, { name: 'Combination / Sequence 5+ times', pct: 45 }],
    moreCount: 18, tags: ['ufc', 'sports', 'live'],
  },
  {
    id: 'mn2', slug: 'trump-say-march-8', title: 'What will Trump say this week (March 8)?',
    image: null, dateDay: '9', dateMonth: 'Mar', dateLabel: '9 Mar',
    timeLabel: 'Mon, 3:00 AM', volume: 181_532, isLive: false, isNew: false,
    outcomes: [{ name: 'Make America Great Again / MAGA', pct: 88 }, { name: 'Transgender', pct: 34 }],
    moreCount: 25, tags: ['trump', 'politics'],
  },
  {
    id: 'mn3', slug: 'joe-rogan-episode-march-15', title: 'What will be said on the first Joe Rogan Experience episode of the week? (March 15)',
    image: null, dateDay: '11', dateMonth: 'Mar', dateLabel: '11 Mar',
    timeLabel: 'Wed, 6:00 AM', volume: 0, isLive: false, isNew: true,
    outcomes: [{ name: 'Holy Shit', pct: 72 }, { name: 'Fuck him up', pct: 41 }],
    moreCount: 11, tags: ['rogan', 'podcast'],
  },
  {
    id: 'mn4', slug: 'starmer-pmq-questions', title: "What will Keir Starmer say at the next Prime Minister's Questions event?",
    image: null, dateDay: '11', dateMonth: 'Mar', dateLabel: '11 Mar',
    timeLabel: 'Wed, 7:00 PM', volume: 0, isLive: false, isNew: true,
    outcomes: [{ name: 'Mr. Speaker 20+', pct: 55 }, { name: 'Mr. Speaker 30+', pct: 28 }],
    moreCount: 17, tags: ['starmer', 'uk', 'politics'],
  },
  {
    id: 'mn5', slug: 'oscars-mentions-2026', title: 'What will be said during the Oscars?',
    image: null, dateDay: '16', dateMonth: 'Mar', dateLabel: '16 Mar',
    timeLabel: 'Mon, 9:00 AM', volume: 24_901, isLive: false, isNew: false,
    outcomes: [{ name: 'Chalamet 5+ times', pct: 68 }, { name: 'Epstein', pct: 15 }],
    moreCount: 27, tags: ['oscars', 'culture', 'entertainment'],
  },
  {
    id: 'mn6', slug: 'jensen-huang-nvidia-gtc-keynote', title: 'What will Jensen Huang say during the NVIDIA GTC Keynote?',
    image: null, dateDay: '17', dateMonth: 'Mar', dateLabel: '17 Mar',
    timeLabel: 'Tue, 3:00 AM', volume: 10_906, isLive: false, isNew: false,
    outcomes: [{ name: 'AI / Artificial Intelligence 10+ times', pct: 95 }, { name: 'GPU 5+ times', pct: 82 }],
    moreCount: 18, tags: ['nvidia', 'tech', 'ai'],
  },
  {
    id: 'mn7', slug: 'powell-march-press-conference', title: 'What will Powell say during March Press Conference?',
    image: null, dateDay: '19', dateMonth: 'Mar', dateLabel: '19 Mar',
    timeLabel: 'Thu, 3:30 AM', volume: 21_980, isLive: false, isNew: false,
    outcomes: [{ name: 'Inflation 40+ times', pct: 58 }, { name: 'Inflation 50+ times', pct: 22 }],
    moreCount: 33, tags: ['powell', 'fed', 'finance'],
  },
  {
    id: 'mn8', slug: 'trump-say-march-2026', title: 'What will Trump say in March?',
    image: null, dateDay: '31', dateMonth: 'Mar', dateLabel: '31 Mar',
    timeLabel: 'Tue, 11:00 PM', volume: 70_775, isLive: false, isNew: false,
    outcomes: [{ name: 'Big Fat Cat', pct: 12 }, { name: 'N Word', pct: 5 }],
    moreCount: 30, tags: ['trump', 'politics'],
  },
  {
    id: 'mn9', slug: 'trump-post-march-2-8', title: 'What will Donald Trump post this week? (March 2 - March 8)',
    image: null, dateDay: 'TBD', dateMonth: '', dateLabel: 'TBD',
    timeLabel: '', volume: 30_491, isLive: false, isNew: false,
    outcomes: [{ name: 'President DJT', pct: 44 }, { name: 'RINO', pct: 31 }],
    moreCount: 17, tags: ['trump', 'politics', 'social'],
  },
  {
    id: 'mn10', slug: 'trump-say-march-15', title: 'What will Trump say this week (March 15)?',
    image: null, dateDay: 'TBD', dateMonth: '', dateLabel: 'TBD',
    timeLabel: '', volume: 0, isLive: false, isNew: true,
    outcomes: [{ name: 'Autopen', pct: 8 }, { name: 'MAGA / Make America Great Again', pct: 88 }],
    moreCount: 30, tags: ['trump', 'politics'],
  },
  {
    id: 'mn11', slug: 'trump-post-march-9-15', title: 'What will Trump post this week? (March 9 - March 15)',
    image: null, dateDay: 'TBD', dateMonth: '', dateLabel: 'TBD',
    timeLabel: '', volume: 0, isLive: false, isNew: true,
    outcomes: [{ name: 'President DJT', pct: 44 }, { name: 'Transgender', pct: 22 }],
    moreCount: 28, tags: ['trump', 'politics', 'social'],
  },
];

// ── Filter pills ──

const FILTER_PILLS = ['All', 'Trump', 'Politics', 'Sports', 'Tech', 'Culture', 'Finance', 'Live', 'New'];

function matchesFilter(card: MentionCard, filter: string): boolean {
  if (filter === 'All') return true;
  if (filter === 'Live') return card.isLive;
  if (filter === 'New') return card.isNew;
  return card.tags.some((t) => t.toLowerCase() === filter.toLowerCase());
}

// ── Component ──

export default function MentionsView() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('All');
  const [cards, setCards] = useState<MentionCard[]>(MENTION_CARDS);
  const [apiLoaded, setApiLoaded] = useState(false);

  // Fetch from our API route (has CLOB prices, placeholder filtering, volume sync)
  const loadFromApi = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket/events?tag=mentions&limit=30');
      if (!res.ok) return;
      const markets: Market[] = await res.json();
      if (markets.length > 0) {
        const mapped: MentionCard[] = markets.map((m) => {
          const endDate = m.end_date_iso ? new Date(m.end_date_iso) : null;
          const day = endDate ? String(endDate.getDate()) : 'TBD';
          const month = endDate ? endDate.toLocaleDateString('en-US', { month: 'short' }) : '';
          const timeStr = endDate
            ? endDate.toLocaleDateString('en-US', { weekday: 'short' }) + ', ' +
              endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : '';

          const isMulti = m.tokens.length > 2;
          const outcomes: MentionOutcome[] = isMulti
            ? m.tokens.slice(0, 2).map(t => ({
                name: t.label || t.outcome,
                pct: Math.round(t.price * 100),
              }))
            : m.tokens.filter(t => t.outcome === 'Yes').slice(0, 2).map(t => ({
                name: t.label || m.question,
                pct: Math.round(t.price * 100),
              }));

          return {
            id: `pm-${m.id}`,
            slug: m.slug,
            title: m.question,
            image: m.image_url || null,
            dateDay: day,
            dateMonth: month,
            dateLabel: endDate ? `${day} ${month}` : 'TBD',
            timeLabel: timeStr,
            volume: m.volume || 0,
            isLive: false,
            isNew: m.volume === 0,
            outcomes,
            moreCount: Math.max(0, m.tokens.length - 2),
            tags: m.tags?.map(t => t.slug) || [],
          };
        });
        setCards(mapped);
        setApiLoaded(true);
      }
    } catch {
      // Keep dummy data
    }
  }, []);

  useEffect(() => { loadFromApi(); }, [loadFromApi]);

  const filtered = activeFilter === 'All' ? cards : cards.filter((c) => matchesFilter(c, activeFilter));

  return (
    <div style={{ paddingTop: 20, paddingBottom: 64, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
        Mention polymarkets
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Live events where you can predict the words and phrases that will be said.
      </p>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill}
            onClick={() => setActiveFilter(pill)}
            className="pill-hover"
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500,
              border: '1px solid var(--border)',
              background: activeFilter === pill ? 'var(--text-primary)' : 'transparent',
              color: activeFilter === pill ? 'var(--bg)' : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Market rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {filtered.map((card) => (
          <button
            key={card.id}
            onClick={() => router.push(`/event/${card.slug}`)}
            className="row-hover"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px', border: 'none', cursor: 'pointer', textAlign: 'left',
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {/* Thumbnail */}
            {card.image ? (
              <img
                src={card.image}
                alt=""
                style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                background: 'var(--bg-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
            )}

            {/* Title + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {card.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {card.timeLabel && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{card.timeLabel}</span>
                )}
                {card.isLive && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 700, color: 'var(--no-red)',
                    textTransform: 'uppercase',
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--no-red)',
                      display: 'inline-block', animation: 'pulse-live 1.5s ease-in-out infinite',
                    }} />
                    LIVE
                  </span>
                )}
                {card.volume > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtVol(card.volume)}</span>
                )}
                {card.isNew && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--brand-blue)',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    + NEW
                  </span>
                )}
              </div>
            </div>

            {/* Outcome pills — hidden on mobile */}
            <div className="hidden md:flex" style={{ alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {card.outcomes.map((o) => (
                <span
                  key={o.name}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap', maxWidth: 180,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {o.name}
                </span>
              ))}
              {card.moreCount > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  +{card.moreCount}
                </span>
              )}
            </div>

            {/* Trade button */}
            <div
              style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: 'var(--brand-blue)', color: '#fff',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              Trade
            </div>
          </button>
        ))}
      </div>

      {/* Show more */}
      {!apiLoaded && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button
            className="card-hover"
            style={{
              padding: '10px 32px', borderRadius: 999, fontSize: 14, fontWeight: 600,
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >
            Show more markets
          </button>
        </div>
      )}
    </div>
  );
}
