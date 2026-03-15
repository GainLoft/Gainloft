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

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

/**
 * Connects directly to Polymarket's CLOB websocket for instant price updates.
 * Receives best_bid_ask and last_trade_price events pushed by the server.
 * Falls back to REST polling if websocket fails.
 */
export function useLivePrices(tokenIds: string[], _intervalMs: number = 1000): PriceMap {
  const [prices, setPrices] = useState<PriceMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const idsRef = useRef<string[]>([]);

  const key = useMemo(() => {
    const sorted = [...tokenIds].sort();
    return sorted.length > 0 ? sorted.join(',') : '';
  }, [tokenIds]);

  useEffect(() => { idsRef.current = tokenIds; }, [tokenIds]);

  // Fetch initial prices via REST so cards show prices immediately
  useEffect(() => {
    if (!key) return;
    const ids = idsRef.current;
    if (ids.length === 0) return;
    fetch('/api/polymarket/midpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids),
    }).then(r => r.ok ? r.json() : {}).then((data: PriceMap) => {
      if (mountedRef.current && Object.keys(data).length > 0) {
        setPrices(prev => ({ ...prev, ...data }));
      }
    }).catch(() => {});
  }, [key]);

  useEffect(() => {
    mountedRef.current = true;
    if (!key) return;

    let retryDelay = 3000;

    const connect = () => {
      if (!mountedRef.current) return;

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          retryDelay = 3000;
          const ids = idsRef.current;
          if (ids.length > 0) {
            ws.send(JSON.stringify({
              assets_ids: ids,
              type: 'market',
              custom_feature_enabled: true,
            }));
          }
          // Heartbeat every 10s
          pingRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('PING');
          }, 10_000);
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          if (event.data === 'PONG') return;

          try {
            const msgs = JSON.parse(event.data);
            const list = Array.isArray(msgs) ? msgs : [msgs];

            setPrices(prev => {
              let updated = false;
              const next = { ...prev };

              for (const msg of list) {
                // best_bid_ask: best bid/ask changed
                if (msg.event_type === 'best_bid_ask' && msg.asset_id) {
                  const bid = parseFloat(msg.best_bid || '0') || 0;
                  const ask = parseFloat(msg.best_ask || '0') || 0;
                  const mid = (bid + ask) / 2;
                  if (next[msg.asset_id]?.mid !== mid) {
                    next[msg.asset_id] = { bid, ask, mid };
                    updated = true;
                  }
                }
                // last_trade_price: a trade executed
                else if (msg.event_type === 'last_trade_price' && msg.asset_id && msg.price) {
                  const price = parseFloat(msg.price) || 0;
                  const existing = next[msg.asset_id];
                  if (!existing || Math.abs(existing.mid - price) > 0.001) {
                    next[msg.asset_id] = { bid: existing?.bid ?? price, ask: existing?.ask ?? price, mid: price };
                    updated = true;
                  }
                }
                // price_change: orderbook update with best_bid/best_ask
                else if (msg.event_type === 'price_change' && msg.price_changes) {
                  for (const pc of msg.price_changes) {
                    if (pc.asset_id && pc.best_bid != null && pc.best_ask != null) {
                      const bid = parseFloat(pc.best_bid) || 0;
                      const ask = parseFloat(pc.best_ask) || 0;
                      const mid = (bid + ask) / 2;
                      if (next[pc.asset_id]?.mid !== mid) {
                        next[pc.asset_id] = { bid, ask, mid };
                        updated = true;
                      }
                    }
                  }
                }
              }

              return updated ? next : prev;
            });
          } catch { /* ignore non-JSON */ }
        };

        ws.onclose = () => {
          if (pingRef.current) clearInterval(pingRef.current);
          if (mountedRef.current) {
            reconnectRef.current = setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 1.5, 30_000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (mountedRef.current) {
          reconnectRef.current = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 1.5, 30_000);
        }
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (pingRef.current) clearInterval(pingRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [key]);

  // Handle token ID changes — subscribe to new tokens without reconnecting
  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && idsRef.current.length > 0) {
      ws.send(JSON.stringify({
        assets_ids: idsRef.current,
        type: 'market',
        custom_feature_enabled: true,
      }));
    }
  }, [key]);

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
