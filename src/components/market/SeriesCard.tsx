'use client';

import Link from 'next/link';

export interface SeriesData {
  seriesSlug: string;
  seriesTitle: string;
  recurrence: string;
  volume24hr: number;
  liquidity: number;
  image: string;
  eventSlug: string;
  eventTitle: string;
  eventEndDate: string;
  startTime: string | null;
  outcomes: string[];
  prices: number[];
  tokenIds: string[];
  tags: { slug: string; label: string }[];
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(0)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function formatRecurrence(rec: string): string {
  switch (rec) {
    case '5m': return '5 Min';
    case '15m': return '15 Min';
    case '1h': case 'hourly': return 'Hourly';
    case '4h': return '4 Hour';
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    default: return rec;
  }
}

function formatTimeRange(startTime: string | null, endDate: string): string {
  if (!startTime) return '';
  const start = new Date(startTime);
  const end = new Date(endDate);
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
  return `${fmt(start)} - ${fmt(end)} ET`;
}

export default function SeriesCard({ series }: { series: SeriesData }) {
  const isUpDown = series.outcomes.includes('Up') && series.outcomes.includes('Down');
  const upIdx = series.outcomes.indexOf('Up');
  const downIdx = series.outcomes.indexOf('Down');
  const yesIdx = series.outcomes.indexOf('Yes');

  const upPct = isUpDown && upIdx >= 0 ? Math.round(series.prices[upIdx] * 100) : null;
  const downPct = isUpDown && downIdx >= 0 ? Math.round(series.prices[downIdx] * 100) : null;
  const yesPct = !isUpDown && yesIdx >= 0 ? Math.round(series.prices[yesIdx] * 100) : null;

  const timeRange = formatTimeRange(series.startTime, series.eventEndDate);

  return (
    <Link
      href={`/event/${series.eventSlug}`}
      className="flex flex-col rounded-[10px] p-4 card-hover"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: 190 }}
    >
      {/* Header: image + title + gauge */}
      <div className="flex items-start gap-3">
        <div className="flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-lg overflow-hidden">
          {series.image ? (
            <img src={series.image} alt="" className="h-[40px] w-[40px] rounded-lg object-cover" loading="lazy" />
          ) : (
            <div className="h-[40px] w-[40px] rounded-lg" style={{ background: 'var(--bg-surface)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-medium leading-[18px] line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {series.seriesTitle}
          </h3>
          {timeRange && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{timeRange}</p>
          )}
        </div>
        {/* Percentage gauge for up/down */}
        {isUpDown && upPct !== null && (
          <div className="flex-shrink-0">
            <svg width={38} height={38} viewBox="0 0 38 38">
              <circle cx="19" cy="19" r="16" fill="none" stroke="var(--gauge-track)" strokeWidth={4} />
              <circle
                cx="19" cy="19" r="16"
                fill="none"
                stroke={upPct >= 50 ? 'var(--yes-green)' : 'var(--no-red)'}
                strokeWidth={4}
                strokeDasharray={`${(upPct / 100) * 2 * Math.PI * 16} ${(1 - upPct / 100) * 2 * Math.PI * 16}`}
                strokeDashoffset={2 * Math.PI * 16 * 0.25}
                strokeLinecap="round"
                transform="rotate(-90 19 19)"
              />
              <text x="19" y="20" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill="var(--text-primary)" fontFamily="system-ui">
                {upPct}%
              </text>
            </svg>
          </div>
        )}
      </div>

      {/* Up/Down buttons */}
      {isUpDown && upPct !== null && downPct !== null ? (
        <div className="mt-auto flex gap-2" style={{ paddingTop: 12 }}>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-yes-hover"
            style={{ color: 'var(--yes-green)', background: 'var(--green-bg)', height: 44, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-center" style={{ gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              <span className="text-[13px] font-semibold">Up</span>
              <span className="text-[13px] font-semibold tabular-nums">{upPct}¢</span>
            </div>
            <span className="text-[10px] tabular-nums" style={{ opacity: 0.7 }}>
              {series.prices[upIdx] > 0 ? (1 / series.prices[upIdx]).toFixed(2) : '0'}x payout
            </span>
          </button>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-no-hover"
            style={{ color: 'var(--no-red)', background: 'var(--red-bg)', height: 44, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-center" style={{ gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              <span className="text-[13px] font-semibold">Down</span>
              <span className="text-[13px] font-semibold tabular-nums">{downPct}¢</span>
            </div>
            <span className="text-[10px] tabular-nums" style={{ opacity: 0.7 }}>
              {series.prices[downIdx] > 0 ? (1 / series.prices[downIdx]).toFixed(2) : '0'}x payout
            </span>
          </button>
        </div>
      ) : yesPct !== null ? (
        /* Standard Yes/No buttons */
        <div className="mt-auto flex gap-2" style={{ paddingTop: 12 }}>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-yes-hover"
            style={{ color: 'var(--yes-green)', background: 'var(--green-bg)', height: 44, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <span className="text-[13px] font-semibold tabular-nums">Yes {yesPct}¢</span>
          </button>
          <button
            className="flex flex-1 flex-col items-center justify-center rounded-[6px] btn-no-hover"
            style={{ color: 'var(--no-red)', background: 'var(--red-bg)', height: 44, padding: '4px 6px', gap: 1 }}
            onClick={(e) => e.preventDefault()}
          >
            <span className="text-[13px] font-semibold tabular-nums">No {100 - yesPct}¢</span>
          </button>
        </div>
      ) : null}

      {/* Footer: volume + recurrence badge + LIVE */}
      <div className="mt-3 flex items-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <span className="font-medium">{formatVolume(series.volume24hr)} Vol.</span>
        <span
          className="ml-2 px-[6px] py-[1px] rounded-[4px] text-[10px] font-semibold"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
        >
          {formatRecurrence(series.recurrence)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="live-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--no-red)', display: 'inline-block' }} />
          <span className="text-[11px] font-semibold" style={{ color: 'var(--no-red)' }}>LIVE</span>
        </div>
      </div>
    </Link>
  );
}
