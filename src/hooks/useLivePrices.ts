'use client';

import useSWR from 'swr';
import { Market } from '@/lib/types';

/**
 * Takes an array of markets and returns them with live CLOB midpoint prices
 * merged in. Polls every 10s. Only fetches for active (non-resolved) markets.
 */
export function useLiveMarkets(markets: Market[]): Market[] {
  // Only fetch live prices for active markets
  const activeMarkets = markets.filter(m => !m.resolved && !m.closed);

  // Collect all Yes token IDs from active markets
  const tokenIds = activeMarkets.flatMap(m =>
    m.tokens.filter(t => t.outcome === 'Yes').map(t => t.token_id)
  ).filter(Boolean);

  // Deduplicate
  const uniqueIds = Array.from(new Set(tokenIds));

  const { data: livePrices } = useSWR<Record<string, { bid: number; ask: number; mid: number }>>(
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
        // Find the corresponding Yes token to derive No price
        const yesToken = m.tokens.find(yt => yt.outcome === 'Yes');
        if (yesToken) {
          const live = livePrices[yesToken.token_id];
          if (live?.mid) return { ...t, price: 1 - live.mid };
        }
      }
      return t;
    });
    // Re-sort only negRisk events by price; non-negRisk keep threshold order
    const finalTokens = updatedTokens.length > 2 && m.neg_risk
      ? [...updatedTokens].sort((a, b) => b.price - a.price)
      : updatedTokens;
    return { ...m, tokens: finalTokens };
  });
}
