'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Market } from '@/lib/types';

/** Market thumbnail with blur-to-sharp transition */
function MarketImage({ src, size = 40 }: { src: string; size?: number }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="flex-shrink-0 rounded-lg overflow-hidden" style={{ width: size, height: size, background: 'var(--bg-surface)' }}>
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="object-cover"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{
          filter: loaded ? 'none' : 'blur(10px)',
          transform: loaded ? 'scale(1)' : 'scale(1.1)',
          transition: 'filter 0.3s ease, transform 0.3s ease',
        }}
      />
    </div>
  );
}

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
  // 2+ words, each starts uppercase and is all letters (allows hyphens/apostrophes)
  if (words.length >= 2 && words.every(w => /^[A-Z][a-zA-Z'-]+$/.test(w))) {
    return words[words.length - 1];
  }
  return label;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function MiniGauge({ pct }: { pct: number }) {
  const r = 16;
  const stroke = 4;
  const circumference = 2 * Math.PI * r;
  const filled = (pct / 100) * circumference;
  return (
    <svg width={38} height={38} viewBox="0 0 38 38" className="flex-shrink-0">
      <circle cx="19" cy="19" r={r} fill="none" stroke="var(--gauge-track)" strokeWidth={stroke} />
      <circle
        cx="19" cy="19" r={r}
        fill="none"
        stroke={pct >= 50 ? 'var(--yes-green)' : 'var(--no-red)'}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference * 0.25}
        strokeLinecap="round"
        transform="rotate(-90 19 19)"
      />
      <text x="19" y="20" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill="var(--text-primary)" fontFamily="system-ui">
        {pct}%
      </text>
    </svg>
  );
}

// Detect series Up/Down events and extract display info
function getSeriesInfo(market: Market): { shortTitle: string; timeRange: string; interval: string } | null {
  const title = market.question || '';
  const slug = market.slug || '';

  // Must be an "Up or Down" event
  if (!title.toLowerCase().includes('up or down') && !slug.includes('updown') && !slug.includes('up-or-down')) return null;
  // Must start with a known crypto/asset name (from title or slug)
  const CRYPTO_SLUG_RE = /^(btc|eth|sol|xrp|doge|bnb|hype|ada|dot|avax|matic|link)/;
  const CRYPTO_TITLE_RE = /^(Bitcoin|Ethereum|Solana|XRP|Dogecoin|BNB|HYPE|Cardano|Polkadot|Avalanche|Polygon|Chainlink)\b/i;
  if (!CRYPTO_SLUG_RE.test(slug) && !CRYPTO_TITLE_RE.test(title)) return null;

  // Extract asset name from the API title: "Bitcoin Up or Down - ..." → "Bitcoin"
  const assetMatch = title.match(/^(.+?)\s+Up or Down/i);
  const assetName = assetMatch ? assetMatch[1] : '';

  // Detect interval from slug or tags
  const TAG_TO_INTERVAL: Record<string, string> = {
    '5M': '5 Minutes', '5m': '5 Minutes',
    '15M': '15 Minutes', '15m': '15 Minutes',
    '1H': 'Hourly', hourly: 'Hourly',
    '4h': '4 Hours', '4hour': '4 Hours',
    daily: 'Daily', 'daily-close': 'Daily',
    weekly: 'Weekly', monthly: 'Monthly',
  };
  const TAG_TO_SHORT: Record<string, string> = {
    '5M': '5 Min', '5m': '5 Min',
    '15M': '15 Min', '15m': '15 Min',
    '1H': 'Hourly', hourly: 'Hourly',
    '4h': '4 Hour', '4hour': '4 Hour',
    daily: 'Daily', 'daily-close': 'Daily',
    weekly: 'Weekly', monthly: 'Monthly',
  };

  let durationLabel = '';
  let intervalShort = '';

  // Try tags first (most reliable, straight from Polymarket)
  const tagSlugs = (market.tags || []).map((t: any) => typeof t === 'string' ? t : t.slug || '');
  for (const ts of tagSlugs) {
    if (TAG_TO_INTERVAL[ts]) {
      durationLabel = TAG_TO_INTERVAL[ts];
      intervalShort = TAG_TO_SHORT[ts];
      break;
    }
  }

  // Fallback: detect from slug pattern
  if (!durationLabel) {
    const slugIntervalMatch = slug.match(/-(5m|15m|1h|4h|hourly|daily|weekly|monthly)/i);
    if (slugIntervalMatch) {
      const key = slugIntervalMatch[1].toLowerCase();
      durationLabel = TAG_TO_INTERVAL[key] || key;
      intervalShort = TAG_TO_SHORT[key] || key;
    }
  }

  // Extract time range from title: "...- March 10, 1:20AM-1:25AM ET" → "1:20AM-1:25AM ET"
  const timeRangeMatch = title.match(/,\s*(.+)$/);
  const timeRange = timeRangeMatch ? timeRangeMatch[1] : '';

  const suffix = durationLabel ? ` - ${durationLabel}` : '';
  return { shortTitle: `${assetName} Up or Down${suffix}`, timeRange, interval: intervalShort };
}

export default function MarketCard({ market }: { market: Market }) {
  const yesToken = market.tokens.find((t) => t.outcome === 'Yes');
  const noToken = market.tokens.find((t) => t.outcome === 'No');
  const yesPrice = yesToken ? yesToken.price : 0.5;
  const yesPct = Math.round(yesPrice * 100);
  const isMultiOutcome = market.tokens.length > 2;

  // Series Up/Down card (Polymarket-style)
  const seriesInfo = getSeriesInfo(market);
  if (seriesInfo) {
    const upPrice = yesPrice;
    const downPrice = noToken ? noToken.price : 1 - yesPrice;
    const upCents = Math.round(upPrice * 100);
    const downCents = Math.round(downPrice * 100);
    const upMulti = upPrice > 0 ? (1 / upPrice) : 0;
    const downMulti = downPrice > 0 ? (1 / downPrice) : 0;
    const isLive = market.end_date_iso ? new Date(market.end_date_iso).getTime() > Date.now() : false;

    return (
      <Link
        href={`/event/${market.slug}`}
        className="flex flex-col rounded-[10px] p-4 card-hover"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: 190 }}
      >
        <div className="flex items-start gap-3">
          {market.image_url ? (
            <MarketImage src={market.image_url} />
          ) : (
            <div className="h-[40px] w-[40px] rounded-lg flex-shrink-0" style={{ background: 'var(--bg-surface)' }} />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold leading-[18px]" style={{ color: 'var(--text-primary)' }}>
              {seriesInfo.shortTitle}
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {seriesInfo.timeRange}
            </p>
          </div>
          <MiniGauge pct={upCents > 50 ? upCents : downCents > 50 ? downCents : 50} />
        </div>

        <div className="mt-auto flex gap-2" style={{ paddingTop: 12 }}>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-yes-hover"
            style={{ color: 'var(--yes-green)', background: 'var(--green-bg)', height: 44, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <span className="text-[13px] font-semibold tabular-nums">↑ Up {upCents}¢</span>
            <span className="text-[10px] tabular-nums" style={{ opacity: 0.7 }}>{upMulti.toFixed(2)}x payout</span>
          </button>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-no-hover"
            style={{ color: 'var(--no-red)', background: 'var(--red-bg)', height: 44, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <span className="text-[13px] font-semibold tabular-nums">↓ Down {downCents}¢</span>
            <span className="text-[10px] tabular-nums" style={{ opacity: 0.7 }}>{downMulti.toFixed(2)}x payout</span>
          </button>
        </div>

        <div className="mt-3 flex items-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <span className="font-medium">{formatVolume(Number(market.volume))} Vol.</span>
          {seriesInfo.interval && (
            <span style={{ marginLeft: 8 }}>{seriesInfo.interval}</span>
          )}
          {isLive && (
            <span className="ml-auto flex items-center font-semibold" style={{ color: 'var(--no-red)', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--no-red)', display: 'inline-block' }} />
              LIVE
            </span>
          )}
          {!isLive && (
            <div className="ml-auto flex items-center gap-2">
              <svg className="h-[15px] w-[15px]" style={{ color: 'var(--text-icon)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
              <svg className="h-[15px] w-[15px]" style={{ color: 'var(--text-icon)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
          )}
        </div>
      </Link>
    );
  }

  // Standard card
  return (
    <Link
      href={`/event/${market.slug}`}
      className="flex flex-col rounded-[10px] p-4 card-hover"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: 190 }}
    >
      <div className="flex items-start gap-3">
        {market.image_url ? (
          <MarketImage src={market.image_url} />
        ) : (
          <div className="h-[40px] w-[40px] rounded-lg flex-shrink-0" style={{ background: 'var(--bg-surface)' }} />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-medium leading-[18px] line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {market.question}
          </h3>
        </div>
        {!isMultiOutcome && <MiniGauge pct={yesPct} />}
      </div>

      {isMultiOutcome ? (
        <div className="mt-3" style={{ flex: 1 }}>
          {market.tokens.filter((t) => t.price > 0).slice(0, 3).map((token) => {
            const pct = Math.round(token.price * 100);
            const multi = token.price > 0 ? (1 / token.price) : 0;
            const displayName = token.label ?? token.outcome;
            return (
              <div key={token.token_id} className="flex items-center justify-between py-[5px]" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-[13px] truncate mr-2" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
                <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{multi >= 10 ? multi.toFixed(0) : multi.toFixed(1)}x</span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-auto flex gap-2" style={{ paddingTop: 12 }}>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-yes-hover"
            style={{ color: 'var(--yes-green)', background: 'var(--green-bg)', height: 44, overflow: 'hidden', minWidth: 0, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex items-center w-full justify-center" style={{ gap: 4, minWidth: 0 }}>
              <MarqueeLabel text={shortLabel(yesToken?.label ?? 'Yes')} className="text-[13px] font-semibold" style={{ flex: '0 1 auto', minWidth: 0 }} />
              <span className="text-[13px] font-semibold flex-shrink-0 tabular-nums">{yesPct}¢</span>
            </div>
            <span className="text-[10px] tabular-nums" style={{ opacity: 0.7 }}>{yesPrice > 0 ? (1 / yesPrice).toFixed(2) : '0'}x payout</span>
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

      <div className="mt-3 flex items-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <span className="font-medium">{formatVolume(Number(market.volume))} Vol.</span>
        <div className="ml-auto flex items-center gap-2">
          <svg className="h-[15px] w-[15px] cursor-pointer transition-colors" style={{ color: 'var(--text-icon)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
          <svg className="h-[15px] w-[15px] cursor-pointer transition-colors" style={{ color: 'var(--text-icon)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
