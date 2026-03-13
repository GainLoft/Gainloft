'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Market } from '@/lib/types';

type SearchResult = {
  type: 'market' | 'event';
  id: string;
  slug: string;
  title: string;
  category: string;
  image_url: string | null;
  volume: number;
  yesPct: number | null;
  outcomes?: { label: string; pct: number }[];
};

function formatVol(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function toResults(markets: Market[]): SearchResult[] {
  return markets.map((m) => {
    const isMulti = m.tokens.length > 2;
    const yesToken = m.tokens.find((t) => t.outcome === 'Yes');
    return {
      type: 'market' as const,
      id: m.id,
      slug: m.slug,
      title: m.question,
      category: m.category,
      image_url: m.image_url,
      volume: m.volume,
      yesPct: isMulti ? null : Math.round((yesToken?.price ?? 0.5) * 100),
      outcomes: isMulti
        ? m.tokens.slice(0, 3).map((t) => ({
            label: t.label || t.outcome,
            pct: Math.round(t.price * 100),
          }))
        : undefined,
    };
  });
}

interface SearchDropdownProps {
  query: string;
  onSelect: () => void;
  activeIndex: number;
}

export default function SearchDropdown({ query, onSelect, activeIndex }: SearchDropdownProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced server-side search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/polymarket/events?limit=8&search=${encodeURIComponent(trimmed)}&order=volume24hr`)
        .then((r) => r.json())
        .then((data: Market[]) => {
          const arr = Array.isArray(data) ? data : [];
          setResults(toResults(arr));
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  if (loading && results.length === 0) {
    return (
      <div
        className="absolute left-0 right-0 shadow-lg overflow-hidden"
        style={{
          top: 'calc(100% + 6px)',
          borderRadius: 12,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          zIndex: 200,
        }}
      >
        <div className="flex flex-col gap-2" style={{ padding: 14 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center" style={{ gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-surface)' }} />
              <div className="flex-1">
                <div style={{ width: '70%', height: 14, borderRadius: 4, background: 'var(--bg-surface)' }} />
                <div style={{ width: '40%', height: 10, borderRadius: 4, background: 'var(--bg-surface)', marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0 && !loading) {
    return (
      <div
        className="absolute left-0 right-0 shadow-lg overflow-hidden"
        style={{
          top: 'calc(100% + 6px)',
          borderRadius: 12,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          zIndex: 200,
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{ padding: '28px 16px', color: 'var(--text-muted)', fontSize: 14 }}
        >
          No results for &ldquo;{query}&rdquo;
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute left-0 right-0 shadow-lg overflow-hidden"
      style={{
        top: 'calc(100% + 6px)',
        borderRadius: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        zIndex: 200,
        maxHeight: 480,
        overflowY: 'auto',
      }}
    >
      {results.map((r, idx) => {
        const isActive = idx === activeIndex;
        return (
          <Link
            key={`${r.type}-${r.id}`}
            href={`/event/${r.slug}`}
            onClick={onSelect}
            id={`search-result-${idx}`}
            className="flex items-center transition-colors"
            style={{
              padding: '10px 14px',
              gap: 12,
              textDecoration: 'none',
              background: isActive ? 'var(--bg-surface)' : 'transparent',
              borderBottom: idx < results.length - 1 ? '1px solid var(--border-light, var(--border))' : 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-surface)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
          >
            {/* Image */}
            <div
              className="flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ width: 36, height: 36, borderRadius: 8 }}
            >
              {r.image_url ? (
                <Image
                  src={r.image_url}
                  alt=""
                  width={36}
                  height={36}
                  className="object-cover"
                  style={{ borderRadius: 8 }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}
                >
                  {r.title.charAt(0)}
                </div>
              )}
            </div>

            {/* Title + category */}
            <div className="flex-1 min-w-0">
              <div
                className="font-medium truncate"
                style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: '18px' }}
              >
                {r.title}
              </div>
              <div className="flex items-center" style={{ gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.category}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>&middot;</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatVol(r.volume)} Vol</span>
              </div>
            </div>

            {/* Price / outcomes */}
            <div className="flex-shrink-0 text-right">
              {r.yesPct !== null ? (
                <span
                  className="font-bold tabular-nums"
                  style={{
                    fontSize: 16,
                    color: r.yesPct >= 50 ? 'var(--yes-green)' : 'var(--no-red)',
                  }}
                >
                  {r.yesPct}%
                  <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 2 }}>Yes</span>
                </span>
              ) : r.outcomes && r.outcomes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {r.outcomes.slice(0, 2).map((o, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-end"
                      style={{ gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}
                    >
                      <span className="truncate" style={{ maxWidth: 80 }}>{o.label}</span>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {o.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Link>
        );
      })}

      {/* Footer: view all */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
        }}
      >
        <Link
          href={`/markets?q=${encodeURIComponent(query)}`}
          onClick={onSelect}
          className="font-medium transition-colors hover:opacity-80"
          style={{ fontSize: 13, color: 'var(--brand-blue)' }}
        >
          View all results &rarr;
        </Link>
      </div>
    </div>
  );
}

export type { SearchResult };
