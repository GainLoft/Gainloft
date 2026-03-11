/* eslint-disable @typescript-eslint/no-explicit-any */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Auth token management
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('auth_token', token);
    else localStorage.removeItem('auth_token');
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== 'undefined') {
    authToken = localStorage.getItem('auth_token');
  }
  return authToken;
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// SWR fetcher
export const fetcher = <T>(path: string) => api.get<T>(path);

// ─── Auth ────────────────────────────────────────────────────

export async function getNonce(address: string) {
  return api.get<{ nonce: string; message: string }>(`/api/auth/nonce/${address.toLowerCase()}`);
}

export async function verifySignature(address: string, signature: string) {
  return api.post<{ user: any; token: string }>('/api/auth/verify', {
    address: address.toLowerCase(),
    signature,
  });
}

// ─── Markets ─────────────────────────────────────────────────

export async function getMarkets(params?: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.search) query.set('search', params.search);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return api.get<{ markets: any[]; total: number }>(`/api/markets${qs ? `?${qs}` : ''}`);
}

export async function getMarketBySlug(slug: string) {
  return api.get<any>(`/api/markets/${slug}`);
}

export async function getMarketHolders(marketId: string) {
  return api.get<any[]>(`/api/markets/${marketId}/holders`);
}

// ─── Orders ──────────────────────────────────────────────────

export async function getOrderBook(marketId: string, tokenId?: string) {
  const query = new URLSearchParams({ market_id: marketId, status: 'LIVE' });
  if (tokenId) query.set('token_id', tokenId);
  return api.get<any[]>(`/api/orders?${query}`);
}

export async function placeOrder(order: {
  market_id: string;
  token_id: string;
  side: 0 | 1;
  price: number;
  size: number;
}) {
  return api.post<{ order: any; trades: any[] }>('/api/orders', order);
}

export async function cancelOrder(orderId: string) {
  return api.del(`/api/orders/${orderId}`);
}

// ─── Trades ──────────────────────────────────────────────────

export async function getTrades(params: { market_id?: string; user_id?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params.market_id) query.set('market_id', params.market_id);
  if (params.user_id) query.set('user_id', params.user_id);
  if (params.limit) query.set('limit', String(params.limit));
  return api.get<any[]>(`/api/trades?${query}`);
}

// ─── Positions ───────────────────────────────────────────────

export async function getPositions(userId: string) {
  return api.get<any[]>(`/api/positions?user_id=${userId}`);
}

// ─── Wallet ──────────────────────────────────────────────────

export async function getBalance() {
  return api.get<{ balance: number }>('/api/wallet/balance');
}

export async function deposit(amount: number, txHash?: string) {
  return api.post<{ balance: number; deposited: number }>('/api/wallet/deposit', { amount, tx_hash: txHash });
}

export async function withdraw(amount: number, toAddress?: string) {
  return api.post<{ balance: number; withdrawn: number }>('/api/wallet/withdraw', { amount, to_address: toAddress });
}

export async function getTransactions(limit?: number) {
  const qs = limit ? `?limit=${limit}` : '';
  return api.get<any[]>(`/api/wallet/transactions${qs}`);
}

// ─── Price History ───────────────────────────────────────────

export async function getPriceHistory(marketId: string, tokenId?: string, period?: string) {
  const query = new URLSearchParams({ market_id: marketId });
  if (tokenId) query.set('token_id', tokenId);
  if (period) query.set('period', period);
  return api.get<any[]>(`/api/price-history?${query}`);
}

// ─── Comments ────────────────────────────────────────────────

export async function getComments(marketId: string) {
  return api.get<any[]>(`/api/comments?market_id=${marketId}`);
}

export async function postComment(marketId: string, body: string, parentId?: string) {
  return api.post<any>('/api/comments', { market_id: marketId, body, parent_id: parentId });
}

export async function deleteComment(commentId: string) {
  return api.del(`/api/comments/${commentId}`);
}

// ─── Leaderboard ─────────────────────────────────────────────

export async function getLeaderboard(period?: string, limit?: number) {
  const query = new URLSearchParams();
  if (period) query.set('period', period);
  if (limit) query.set('limit', String(limit));
  return api.get<any[]>(`/api/leaderboard?${query}`);
}

// ─── Events ──────────────────────────────────────────────────

export async function getEventBySlug(slug: string) {
  return api.get<any>(`/api/events/${slug}`);
}

// ─── Users ───────────────────────────────────────────────────

export async function getUserProfile(address: string) {
  return api.get<any>(`/api/users/${address.toLowerCase()}/profile`);
}
