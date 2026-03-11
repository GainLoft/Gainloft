'use client';

import { useState, useRef, useCallback } from 'react';
import useSWR from 'swr';

interface PricePoint {
  t: number; // unix timestamp
  p: number; // price 0-1
}

interface Props {
  marketId: string;
  tokenId: string;
}

const PERIODS = ['1h', '6h', '1d', '1w', '1m', 'all'] as const;

const swrFetcher = (url: string) => fetch(url).then(r => r.json());

export default function PriceChart({ marketId, tokenId }: Props) {
  void marketId;
  const [period, setPeriod] = useState<typeof PERIODS[number]>('all');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { data } = useSWR<PricePoint[]>(
    tokenId ? `/api/polymarket/prices?token_id=${encodeURIComponent(tokenId)}&period=${period}` : null,
    swrFetcher,
    { refreshInterval: 30000 }
  );

  const prices = Array.isArray(data) ? data : [];
  const latestPrice = prices.length > 0 ? prices[prices.length - 1].p : null;
  const firstPrice = prices.length > 0 ? prices[0].p : null;
  const priceChange = latestPrice !== null && firstPrice !== null ? latestPrice - firstPrice : 0;
  const isUp = priceChange >= 0;

  const maxPrice = prices.length > 0 ? Math.max(...prices.map((p) => p.p), 0.01) : 1;
  const minPrice = prices.length > 0 ? Math.min(...prices.map((p) => p.p), 0) : 0;

  const width = 700;
  const height = 220;
  const padL = 0;
  const padR = 0;
  const padT = 10;
  const padB = 24;

  function getX(index: number) {
    if (prices.length <= 1) return padL;
    return padL + (index / (prices.length - 1)) * (width - padL - padR);
  }

  function getY(price: number) {
    const range = maxPrice - minPrice || 0.01;
    return padT + (1 - (price - minPrice) / range) * (height - padT - padB);
  }

  const lineColor = isUp ? 'var(--yes-green)' : 'var(--no-red)';

  const pathData = prices.length > 1
    ? prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.p).toFixed(1)}`).join(' ')
    : '';

  const areaData = pathData
    ? `${pathData} L ${getX(prices.length - 1).toFixed(1)} ${height - padB} L ${getX(0).toFixed(1)} ${height - padB} Z`
    : '';

  // Find nearest data point index from mouse position
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || prices.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    // Convert SVG x back to index
    const chartW = width - padL - padR;
    const frac = Math.max(0, Math.min(1, (mouseX - padL) / chartW));
    const idx = Math.round(frac * (prices.length - 1));
    setHoverIdx(idx);
  }, [prices.length]);

  const handleMouseLeave = useCallback(() => {
    setHoverIdx(null);
  }, []);

  // Hover display values
  const hoverPoint = hoverIdx !== null ? prices[hoverIdx] : null;
  const displayPrice = hoverPoint ? hoverPoint.p : latestPrice;
  const displayChange = hoverPoint && firstPrice !== null ? hoverPoint.p - firstPrice : priceChange;
  const displayIsUp = displayChange >= 0;
  const hoverDate = hoverPoint ? new Date(hoverPoint.t * 1000) : null;

  return (
    <div>
      {/* Price + change + period selector row */}
      <div className="flex items-end justify-between" style={{ marginBottom: '8px' }}>
        <div className="flex items-baseline" style={{ gap: 8 }}>
          {displayPrice !== null && (
            <span className="text-[28px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {Math.round(displayPrice * 100)}¢
            </span>
          )}
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Yes</span>
          {prices.length > 1 && (
            <span className="text-[13px] font-medium tabular-nums" style={{ color: displayIsUp ? 'var(--yes-green)' : 'var(--no-red)' }}>
              {displayIsUp ? '+' : ''}{(displayChange * 100).toFixed(1)}¢
            </span>
          )}
          {hoverDate && (
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {period === '1h' || period === '6h'
                ? hoverDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : hoverDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex gap-0.5 rounded-[8px] p-0.5" style={{ background: 'var(--bg-surface)' }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-all"
              style={{
                background: period === p ? 'var(--bg-card)' : 'transparent',
                color: period === p ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: period === p ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {prices.length === 0 ? (
        <div className="flex items-center justify-center text-[13px]" style={{ height: `${height}px`, color: 'var(--text-muted)' }}>
          No price data yet
        </div>
      ) : (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: hoverIdx !== null ? 'crosshair' : 'default' }}
        >
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => {
            const y = padT + frac * (height - padT - padB);
            return (
              <line
                key={frac}
                x1={0} y1={y} x2={width} y2={y}
                stroke="var(--border-light)" strokeWidth={1}
              />
            );
          })}

          {areaData && (
            <path d={areaData} fill="url(#chartGradPoly)" />
          )}

          {pathData && (
            <path
              d={pathData}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover crosshair + dot + tooltip */}
          {hoverIdx !== null && hoverPoint && (
            <>
              {/* Vertical line */}
              <line
                x1={getX(hoverIdx)}
                y1={padT}
                x2={getX(hoverIdx)}
                y2={height - padB}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="3,3"
                opacity={0.5}
              />
              {/* Dot on line */}
              <circle
                cx={getX(hoverIdx)}
                cy={getY(hoverPoint.p)}
                r={4}
                fill={lineColor}
                stroke="var(--bg-card)"
                strokeWidth={2}
              />
              {/* Price tooltip */}
              {(() => {
                const tx = getX(hoverIdx);
                const ty = getY(hoverPoint.p);
                const tooltipW = 48;
                const tooltipH = 20;
                // Keep tooltip within SVG bounds
                const clampedX = Math.max(tooltipW / 2 + 2, Math.min(width - tooltipW / 2 - 2, tx));
                const above = ty - tooltipH - 10 >= 0;
                const tooltipY = above ? ty - tooltipH - 8 : ty + 12;
                return (
                  <>
                    <rect
                      x={clampedX - tooltipW / 2}
                      y={tooltipY}
                      width={tooltipW}
                      height={tooltipH}
                      rx={4}
                      fill="var(--brand-blue)"
                    />
                    <text
                      x={clampedX}
                      y={tooltipY + tooltipH / 2 + 4}
                      fill="#fff"
                      fontSize={11}
                      fontWeight={600}
                      fontFamily="system-ui"
                      textAnchor="middle"
                    >
                      {Math.round(hoverPoint.p * 100)}¢
                    </text>
                  </>
                );
              })()}
            </>
          )}

          {/* Time labels on bottom */}
          {prices.length > 2 && [0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const idx = Math.min(Math.round(frac * (prices.length - 1)), prices.length - 1);
            const d = new Date(prices[idx].t * 1000);
            const label = period === '1h' || period === '6h'
              ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <text
                key={frac}
                x={getX(idx)}
                y={height - 4}
                fill="var(--text-muted)"
                fontSize={9}
                fontFamily="system-ui"
                textAnchor="middle"
              >
                {label}
              </text>
            );
          })}

          {/* Price labels on right */}
          {[0, 0.5, 1].map((frac) => {
            const price = minPrice + frac * (maxPrice - minPrice);
            const y = getY(price);
            return (
              <text
                key={frac}
                x={width - 4}
                y={y + 3}
                fill="var(--text-muted)"
                fontSize={9}
                fontFamily="system-ui"
                textAnchor="end"
              >
                {Math.round(price * 100)}¢
              </text>
            );
          })}

          {/* Invisible hover rect to capture mouse events across full chart area */}
          <rect
            x={0}
            y={padT}
            width={width}
            height={height - padT - padB}
            fill="transparent"
            style={{ pointerEvents: 'all' }}
          />

          <defs>
            <linearGradient id="chartGradPoly" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  );
}
