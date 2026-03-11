'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TickPoint {
  time: number;
  price: number;
}

const INTERVALS = [
  { label: 'LIVE', value: 'live', limit: 3000 },
  { label: '1m', value: '1m', limit: 60 },
  { label: '5m', value: '5m', limit: 60 },
  { label: '15m', value: '15m', limit: 60 },
  { label: '1h', value: '1h', limit: 60 },
  { label: '1D', value: '1d', limit: 90 },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Per-symbol singleton feeds: WebSocket + tick buffer persists across remounts
// ─────────────────────────────────────────────────────────────────────────────
const LIVE_WINDOW = 5 * 60 * 1000;
const SAMPLE_INTERVAL = 200;

interface SymbolFeed {
  ticks: TickPoint[];
  latestPrice: number | null;
  ws: WebSocket | null;
  rafRunning: boolean;
  lastSample: number;
  seeded: boolean;
  listeners: Set<() => void>;
}

const feeds: Record<string, SymbolFeed> = {};

function getFeed(symbol: string): SymbolFeed {
  if (!feeds[symbol]) {
    feeds[symbol] = {
      ticks: [],
      latestPrice: null,
      ws: null,
      rafRunning: false,
      lastSample: 0,
      seeded: false,
      listeners: new Set(),
    };
  }
  return feeds[symbol];
}

function notifyListeners(feed: SymbolFeed) {
  feed.listeners.forEach((fn) => fn());
}

function connectWs(symbol: string) {
  const feed = getFeed(symbol);
  if (feed.ws && feed.ws.readyState <= 1) return;
  try {
    const wsSymbol = symbol.toLowerCase();
    feed.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${wsSymbol}@aggTrade`);
    feed.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.p);
        if (!isNaN(price)) feed.latestPrice = price;
      } catch { /* silent */ }
    };
    feed.ws.onclose = () => {
      feed.ws = null;
      setTimeout(() => connectWs(symbol), 2000);
    };
    feed.ws.onerror = () => { /* onclose will fire */ };
  } catch { /* silent */ }
}

function startRafLoop(symbol: string) {
  const feed = getFeed(symbol);
  if (feed.rafRunning) return;
  feed.rafRunning = true;

  function tick(ts: number) {
    if (!feed.rafRunning) return;
    if (ts - feed.lastSample >= SAMPLE_INTERVAL && feed.latestPrice !== null) {
      feed.lastSample = ts;
      const now = Date.now();
      feed.ticks.push({ time: now, price: feed.latestPrice });
      const cutoff = now - LIVE_WINDOW;
      const firstValid = feed.ticks.findIndex((t) => t.time >= cutoff);
      if (firstValid > 0) feed.ticks = feed.ticks.slice(firstValid);
      if (feed.ticks.length > 1500) feed.ticks = feed.ticks.slice(-1500);
      notifyListeners(feed);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function startFeed(symbol: string) {
  const feed = getFeed(symbol);
  if (!feed.seeded) {
    feed.seeded = true;
    fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=1s&limit=300`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const seed: TickPoint[] = data.map((k: unknown[]) => ({
          time: k[6] as number,
          price: parseFloat(k[4] as string),
        }));
        if (seed.length > 0) {
          feed.latestPrice = seed[seed.length - 1].price;
          const firstLiveTime = feed.ticks.length > 0 ? feed.ticks[0].time : Infinity;
          const historicalPart = seed.filter(t => t.time < firstLiveTime);
          feed.ticks = [...historicalPart, ...feed.ticks];
          const cutoff = Date.now() - LIVE_WINDOW;
          feed.ticks = feed.ticks.filter(t => t.time >= cutoff);
          notifyListeners(feed);
        }
      })
      .catch(() => {});
  }
  connectWs(symbol);
  startRafLoop(symbol);
}

// Auto-start BTC feed on module load (most common)
if (typeof window !== 'undefined') {
  startFeed('BTCUSDT');
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  refPrice?: number | null;
  /** Binance symbol, e.g. "BTCUSDT", "ETHUSDT" — defaults to "BTCUSDT" */
  symbol?: string;
}

export default function CryptoLiveChart({ refPrice, symbol = 'BTCUSDT' }: Props) {
  const [interval, setInterval_] = useState<string>('live');
  const [klines, setKlines] = useState<Kline[]>([]);
  const feed = getFeed(symbol);
  const [ticks, setTicks] = useState<TickPoint[]>(() => [...feed.ticks]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const isLive = interval === 'live';
  const cfg = INTERVALS.find((i) => i.value === interval) ?? INTERVALS[0];
  const symLower = symbol.toLowerCase();
  const gradId = `grad-${symbol}`;

  // Kline mode: REST fetch + kline WS
  useEffect(() => {
    if (isLive) return;
    let mounted = true;

    async function fetchKlines() {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${cfg.value}&limit=${cfg.limit}`
        );
        const data = await res.json();
        if (!mounted || !Array.isArray(data)) return;
        setKlines(data.map((k: unknown[]) => ({
          time: k[0] as number,
          open: parseFloat(k[1] as string),
          high: parseFloat(k[2] as string),
          low: parseFloat(k[3] as string),
          close: parseFloat(k[4] as string),
        })));
      } catch { /* silent */ }
    }

    fetchKlines();

    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symLower}@kline_${cfg.value}`);
    ws.onmessage = (event) => {
      try {
        const k = JSON.parse(event.data).k;
        if (!k) return;
        const updated: Kline = {
          time: k.t, open: parseFloat(k.o), high: parseFloat(k.h),
          low: parseFloat(k.l), close: parseFloat(k.c),
        };
        setKlines((prev) => {
          if (prev.length === 0) return prev;
          if (prev[prev.length - 1].time === updated.time) {
            const copy = [...prev];
            copy[copy.length - 1] = updated;
            return copy;
          }
          return [...prev.slice(-(cfg.limit - 1)), updated];
        });
      } catch { /* silent */ }
    };

    return () => { mounted = false; ws.close(); };
  }, [isLive, cfg.value, cfg.limit, symbol, symLower]);

  // Live mode: subscribe to per-symbol global feed
  useEffect(() => {
    if (!isLive) return;

    startFeed(symbol);

    const f = getFeed(symbol);
    if (f.ticks.length > 0) {
      setTicks([...f.ticks]);
    }

    const listener = () => setTicks([...getFeed(symbol).ticks]);
    f.listeners.add(listener);

    return () => {
      f.listeners.delete(listener);
    };
  }, [isLive, symbol]);

  // Sync on mount — handles remount after navigation
  useEffect(() => {
    const f = getFeed(symbol);
    if (f.ticks.length > 0 && ticks.length === 0) {
      setTicks([...f.ticks]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Build unified data arrays
  const prices = isLive ? ticks.map((t) => t.price) : klines.map((k) => k.close);
  const times = isLive ? ticks.map((t) => t.time) : klines.map((k) => k.time);

  // Live mode: fixed 5-min window
  const now = Date.now();
  const timeStart = isLive ? now - LIVE_WINDOW : (times[0] ?? now);
  const timeEnd = isLive ? now : (times[times.length - 1] ?? now);
  const timeSpan = timeEnd - timeStart || 1;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || prices.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 700;
    if (isLive) {
      const hoverTime = timeStart + (x / 700) * timeSpan;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < times.length; i++) {
        const dist = Math.abs(times[i] - hoverTime);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      setHoverIdx(best);
    } else {
      const idx = Math.round((x / 700) * (prices.length - 1));
      setHoverIdx(Math.max(0, Math.min(prices.length - 1, idx)));
    }
  }, [prices.length, isLive, timeStart, timeSpan, times]);

  if (prices.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height: 240, color: 'var(--text-muted)', fontSize: 13 }}>
        <span className="live-pulse">Connecting to Binance...</span>
      </div>
    );
  }

  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);

  // When refPrice is provided (live mode), center the chart on refPrice
  // so the dashed reference line is always in the middle
  const midP = (isLive && refPrice) ? refPrice : (maxP + minP) / 2;
  const minRange = midP * 0.003;
  const maxDeviation = Math.max(Math.abs(maxP - midP), Math.abs(minP - midP));
  const effectiveRange = Math.max(maxDeviation * 2, minRange);
  const viewMin = midP - effectiveRange * 0.55;
  const viewMax = midP + effectiveRange * 0.55;
  const viewRange = viewMax - viewMin;

  const width = 700;
  const height = 220;
  const padT = 8;
  const padB = 22;
  const chartH = height - padT - padB;

  function getX(i: number) {
    if (isLive) {
      return ((times[i] - timeStart) / timeSpan) * width;
    }
    return (i / (prices.length - 1)) * width;
  }
  function getY(price: number) { return padT + (1 - (price - viewMin) / viewRange) * chartH; }

  const lastPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  const isUp = isLive && refPrice ? lastPrice >= refPrice : lastPrice >= firstPrice;
  const lineColor = isUp ? 'var(--yes-green)' : 'var(--no-red)';

  // Build smooth cubic bezier path
  function buildSmoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    return d;
  }

  const points = prices.map((p, i) => ({ x: getX(i), y: getY(p) }));
  const pathD = buildSmoothPath(points);
  const lastPt = points[points.length - 1];
  const firstPt = points[0];
  const areaD = `${pathD} L ${lastPt.x.toFixed(1)} ${height - padB} L ${firstPt.x.toFixed(1)} ${height - padB} Z`;

  const refY = refPrice ? getY(refPrice) : null;

  const hoverPrice = hoverIdx !== null ? prices[hoverIdx] : lastPrice;
  const hoverTime = hoverIdx !== null ? times[hoverIdx] : null;
  const displayChange = hoverPrice - firstPrice;
  const displayPct = firstPrice > 0 ? (displayChange / firstPrice) * 100 : 0;

  function formatTime(ts: number) {
    const d = new Date(ts);
    if (interval === '1d') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (isLive) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  return (
    <div>
      {/* Price header + interval selector */}
      <div className="flex items-end justify-between" style={{ marginBottom: 8 }}>
        <div>
          <span className="font-bold tabular-nums" style={{ fontSize: 24, color: 'var(--text-primary)' }}>
            ${hoverPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="font-semibold tabular-nums" style={{ fontSize: 13, marginLeft: 8, color: displayChange >= 0 ? 'var(--yes-green)' : 'var(--no-red)' }}>
            {displayChange >= 0 ? '+' : ''}{displayChange.toFixed(2)} ({displayPct >= 0 ? '+' : ''}{displayPct.toFixed(2)}%)
          </span>
          {hoverTime && (
            <span style={{ fontSize: 12, marginLeft: 8, color: 'var(--text-muted)' }}>
              {formatTime(hoverTime)}
            </span>
          )}
          {isLive && hoverIdx === null && (
            <span className="inline-flex items-center" style={{ marginLeft: 8, fontSize: 11, color: 'var(--no-red)', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--no-red)', display: 'inline-block' }} className="live-pulse" />
              LIVE
            </span>
          )}
        </div>
        <div className="flex rounded-[8px] p-0.5" style={{ background: 'var(--bg-surface)', gap: 1 }}>
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              onClick={() => { setInterval_(iv.value); setHoverIdx(null); }}
              className="rounded-[6px] px-2 py-1 text-[11px] font-medium transition-all"
              style={{
                background: interval === iv.value ? (iv.value === 'live' ? 'var(--no-red)' : 'var(--bg-card)') : 'transparent',
                color: interval === iv.value ? (iv.value === 'live' ? '#fff' : 'var(--text-primary)') : 'var(--text-secondary)',
                boxShadow: interval === iv.value ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        style={{ cursor: 'crosshair' }}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => {
          const y = padT + frac * chartH;
          return <line key={frac} x1={0} y1={y} x2={width} y2={y} stroke="var(--border-light)" strokeWidth={1} />;
        })}

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Price line */}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Reference price line — always centered in live mode */}
        {refPrice && refY !== null && (
          <>
            <line x1={0} y1={refY} x2={width} y2={refY} stroke="var(--text-secondary)" strokeWidth={1} strokeDasharray="6 4" opacity={0.6} />
            <text x={width - 4} y={refY - 5} fill="var(--text-secondary)" fontSize={9} fontWeight={500} fontFamily="system-ui" textAnchor="end">
              Ref ${refPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </text>
          </>
        )}

        {/* Live dot on last point */}
        {hoverIdx === null && (
          <circle cx={getX(prices.length - 1)} cy={getY(lastPrice)} r={3} fill={lineColor} className="live-pulse" />
        )}

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <>
            <line x1={getX(hoverIdx)} y1={padT} x2={getX(hoverIdx)} y2={height - padB} stroke="var(--text-muted)" strokeWidth={0.5} strokeDasharray="3 2" />
            <circle cx={getX(hoverIdx)} cy={getY(prices[hoverIdx])} r={3.5} fill={lineColor} stroke="var(--bg-card)" strokeWidth={1.5} />
          </>
        )}

        {/* Time labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          if (isLive) {
            const ts = timeStart + frac * timeSpan;
            const x = frac * width;
            return (
              <text key={frac} x={x} y={height - 4} fill="var(--text-muted)" fontSize={9} fontFamily="system-ui" textAnchor="middle">
                {formatTime(ts)}
              </text>
            );
          }
          const idx = Math.min(Math.round(frac * (prices.length - 1)), prices.length - 1);
          return (
            <text key={frac} x={(idx / (prices.length - 1)) * width} y={height - 4} fill="var(--text-muted)" fontSize={9} fontFamily="system-ui" textAnchor="middle">
              {formatTime(times[idx])}
            </text>
          );
        })}

        {/* Price labels on right */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const price = viewMax - frac * viewRange;
          const y = padT + frac * chartH;
          return (
            <text key={`p${frac}`} x={width - 4} y={y + 3} fill="var(--text-muted)" fontSize={8} fontFamily="system-ui" textAnchor="end">
              {price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </text>
          );
        })}

        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.12} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
