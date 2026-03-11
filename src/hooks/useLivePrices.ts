'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import { Market, EventGroup } from '@/lib/types';

type PriceMap = Record<string, { bid: number; ask: number; mid: number }>;

/**
 * Takes an array of markets and returns them with live CLOB midpoint prices
 * merged in. Polls every 10s. Only fetches for active (non-resolved) markets.
 */
export function useLiveMarkets(markets: Market[]): Market[] {
  const activeMarkets = markets.filter(m => !m.resolved && !m.closed);
  const tokenIds = activeMarkets.flatMap(m =>
    m.tokens.filter(t => t.outcome === 'Yes').map(t => t.token_id)
  ).filter(Boolean);
  const uniqueIds = Array.from(new Set(tokenIds));

  const { data: livePrices } = useSWR<PriceMap>(
    uniqueIds.length > 0 ? ['/api/polymarket/midpoints', ...uniqueIds.sort()] : null,
    () => fetch('/api/polymarket/midpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uniqueIds),
    }).then(r => r.json()),
    { refreshInterval: 10_000 }
  );

  if (!livePrices || Object.keys(livePrices).length === 0) return markets;

  return markets.map(m => {
    if (m.resolved || m.closed) return m;
    const updatedTokens = m.tokens.map(t => {
      if (t.outcome === 'Yes') {
        const live = livePrices[t.token_id];
        if (live?.mid) return { ...t, price: live.mid };
      }
      if (t.outcome === 'No') {
        const yesToken = m.tokens.find(yt => yt.outcome === 'Yes');
        if (yesToken) {
          const live = livePrices[yesToken.token_id];
          if (live?.mid) return { ...t, price: 1 - live.mid };
        }
      }
      return t;
    });
    const finalTokens = updatedTokens.length > 2 && m.neg_risk
      ? [...updatedTokens].sort((a, b) => b.price - a.price)
      : updatedTokens;
    return { ...m, tokens: finalTokens };
  });
}

/**
 * Polls CLOB prices every intervalMs for a set of token IDs.
 * Returns a map of token_id → mid price.
 * Used by sports page for 1-second live price updates on match cards.
 */
export function useLivePrices(tokenIds: string[], intervalMs: number = 1000): PriceMap {
  const [prices, setPrices] = useState<PriceMap>({});
  const idsRef = useRef<string[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => { idsRef.current = tokenIds; }, [tokenIds]);

  // Stable key to avoid re-running effect on every render
  const key = useMemo(() => {
    const sorted = [...tokenIds].sort();
    return sorted.length > 0 ? sorted.join(',') : '';
  }, [tokenIds]);

  useEffect(() => {
    mountedRef.current = true;
    if (!key) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const ids = idsRef.current;
      if (ids.length === 0 || !mountedRef.current) return;

      try {
        const res = await fetch('/api/polymarket/midpoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ids),
        });
        if (res.ok && mountedRef.current) {
          const data: PriceMap = await res.json();
          setPrices(prev => {
            const changed = Object.keys(data).some(k => prev[k]?.mid !== data[k]?.mid);
            return changed ? { ...prev, ...data } : prev;
          });
        }
      } catch { /* ignore */ }

      if (mountedRef.current) {
        timeoutId = setTimeout(poll, intervalMs);
      }
    };

    poll();

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [key, intervalMs]);

  return prices;
}

/**
 * Extract all Yes-outcome CLOB token IDs from events for price polling.
 * Only includes real CLOB token IDs (long hex strings), not generated fallbacks.
 */
export function extractTokenIds(events: EventGroup[]): string[] {
  const ids = new Set<string>();
  for (const ev of events) {
    for (const mkt of ev.markets || []) {
      for (const tok of mkt.tokens || []) {
        // Real CLOB token IDs are long numeric strings (50+ chars)
        // Generated IDs contain hyphens like "abc-0"
        if (tok.token_id && tok.token_id.length > 20 && tok.outcome === 'Yes') {
          ids.add(tok.token_id);
        }
      }
    }
  }
  return Array.from(ids);
}
