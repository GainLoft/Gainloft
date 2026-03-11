'use client';

import { useEffect, useRef, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';

interface PriceUpdate {
  type: 'price_update';
  market_id: string;
  tokens: Array<{ token_id: string; outcome: string; price: number }>;
  timestamp: string;
}

export function useWebSocket(
  marketId: string | null,
  onPriceUpdate?: (update: PriceUpdate) => void
) {
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!marketId) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', market_id: marketId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'price_update' && onPriceUpdate) {
          onPriceUpdate(data);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };

    return ws;
  }, [marketId, onPriceUpdate]);

  useEffect(() => {
    const ws = connect();
    return () => {
      if (ws) ws.close();
    };
  }, [connect]);

  return wsRef;
}
