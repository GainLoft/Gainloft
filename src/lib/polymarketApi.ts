/**
 * Polymarket API service for fetching sports futures data.
 *
 * REST:
 *   - Gamma API: https://gamma-api.polymarket.com
 *   - CLOB API:  https://clob.polymarket.com
 *
 * WebSocket:
 *   - wss://ws-subscriptions-clob.polymarket.com/ws/market
 *
 * Usage:
 *   import { fetchEvents, getPolymarketWS } from '@/lib/polymarketApi';
 *   const events = await fetchEvents({ tag: 'nba', closed: false });
 *   const ws = getPolymarketWS();
 *   ws.connect();
 *   const unsub = ws.subscribe(tokenId, (tid, price) => { ... });
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

// ── Polymarket API response types ──

export interface PolymarketToken {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
}

export interface PolymarketMarket {
  id: string;
  condition_id: string;
  question_id: string;
  question: string;
  slug: string;
  description: string;
  tokens: PolymarketToken[];
  volume: number;
  volume_num: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  end_date_iso: string;
  group_item_title?: string;
  image?: string;
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  category: string;
  volume: number;
  liquidity: number;
  end_date_iso: string;
  markets: PolymarketMarket[];
  tags: string[];
}

// ── REST API ──

export async function fetchEvents(params: {
  tag?: string;
  slug?: string;
  limit?: number;
  closed?: boolean;
  active?: boolean;
}): Promise<PolymarketEvent[]> {
  const url = new URL(`${GAMMA_API}/events`);
  if (params.tag) url.searchParams.set('tag', params.tag);
  if (params.slug) url.searchParams.set('slug', params.slug);
  if (params.limit) url.searchParams.set('_limit', String(params.limit));
  if (params.closed !== undefined) url.searchParams.set('closed', String(params.closed));
  if (params.active !== undefined) url.searchParams.set('active', String(params.active));

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`Polymarket API ${res.status}`);
  return res.json();
}

export async function fetchEventBySlug(slug: string): Promise<PolymarketEvent> {
  const events = await fetchEvents({ slug, limit: 1 });
  if (!events.length) throw new Error('Event not found');
  return events[0];
}

export async function fetchMarketPrices(
  tokenIds: string[],
): Promise<Record<string, number>> {
  if (!tokenIds.length) return {};
  const url = new URL(`${CLOB_API}/prices`);
  tokenIds.forEach((id) => url.searchParams.append('token_ids', id));

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`CLOB API ${res.status}`);
  return res.json();
}

// ── WebSocket for real-time price updates ──

type PriceCallback = (tokenId: string, price: number) => void;

export class PolymarketWS {
  private ws: WebSocket | null = null;
  private callbacks = new Map<string, Set<PriceCallback>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 3000;

  connect() {
    if (typeof window === 'undefined') return; // SSR guard
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 3000;
      this.callbacks.forEach((_, tokenId) => {
        this.send({ type: 'market', assets_id: tokenId });
      });
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.asset_id && msg.price !== undefined) {
          const cbs = this.callbacks.get(msg.asset_id);
          cbs?.forEach((cb) => cb(msg.asset_id, Number(msg.price)));
        }
        if (Array.isArray(msg)) {
          for (const item of msg) {
            if (item.asset_id && item.price !== undefined) {
              const cbs = this.callbacks.get(item.asset_id);
              cbs?.forEach((cb) => cb(item.asset_id, Number(item.price)));
            }
          }
        }
      } catch {
        /* ignore parse errors */
      }
    };

    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => this.ws?.close();
  }

  subscribe(tokenId: string, callback: PriceCallback): () => void {
    if (!this.callbacks.has(tokenId)) {
      this.callbacks.set(tokenId, new Set());
    }
    this.callbacks.get(tokenId)!.add(callback);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'market', assets_id: tokenId });
    }

    return () => {
      this.callbacks.get(tokenId)?.delete(callback);
      if (this.callbacks.get(tokenId)?.size === 0) {
        this.callbacks.delete(tokenId);
      }
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.callbacks.clear();
  }

  private send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30_000);
      this.connect();
    }, this.reconnectDelay);
  }
}

// Singleton WebSocket instance
let wsInstance: PolymarketWS | null = null;
export function getPolymarketWS(): PolymarketWS {
  if (!wsInstance) wsInstance = new PolymarketWS();
  return wsInstance;
}

// ── Transform Polymarket event → FuturesMarketData (used by FuturesView) ──

export interface FuturesOutcome {
  name: string;
  pct: number;
  logo?: string;
  polymarket_token_id?: string;
}

export interface FuturesMarketData {
  id: string;
  title: string;
  slug: string;
  variant: 'bar' | 'list';
  defaultShow: number;
  outcomes: FuturesOutcome[];
  polymarket_slug?: string;
}

export function transformEventToFutures(event: PolymarketEvent): FuturesMarketData {
  const outcomes: FuturesOutcome[] = (event.markets || [])
    .map((m) => {
      const yesToken = m.tokens?.find((t) => t.outcome === 'Yes');
      return {
        name: m.group_item_title || m.question,
        pct: Math.round((yesToken?.price || 0) * 100),
        logo: m.image || undefined,
        polymarket_token_id: yesToken?.token_id,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  return {
    id: `pm-${event.id}`,
    title: event.title,
    slug: event.slug,
    variant: outcomes.length > 5 ? 'bar' : 'list',
    defaultShow: outcomes.length > 10 ? 8 : 5,
    polymarket_slug: event.slug,
    outcomes,
  };
}
