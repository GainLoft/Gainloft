import { Market, EventGroup } from '@/lib/types';

// ── Data cleared: now fetching from Polymarket API ──

export const DUMMY_MARKETS: Market[] = [];

export function getMarketBySlug(slug: string): Market | undefined {
  return DUMMY_MARKETS.find((m) => m.slug === slug);
}

export function getMarketsByCategory(category: string): Market[] {
  return DUMMY_MARKETS.filter((m) => m.category === category);
}

export function getMarketsByVolume24h(): Market[] {
  return [...DUMMY_MARKETS].sort((a, b) => b.volume_24hr - a.volume_24hr);
}

export function getMarketsByNew(): Market[] {
  return [...DUMMY_MARKETS].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getMarketsByBreaking(): Market[] {
  return [...DUMMY_MARKETS]
    .sort((a, b) => b.volume_24hr - a.volume_24hr)
    .slice(0, 12);
}

export const DUMMY_EVENT_GROUPS: EventGroup[] = [];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getLiveBtcEventGroup(slug: string): EventGroup | undefined {
  return undefined;
}

export function getCurrentBtcLiveSlug(): string {
  return getCurrentLiveSlug('btc-updown-5m');
}

export function getCurrentLiveSlug(prefix: string): string {
  const now = new Date();
  const baseMinutes = Math.floor(now.getMinutes() / 5) * 5;
  now.setMinutes(baseMinutes, 0, 0);
  return `${prefix}-${Math.floor(now.getTime() / 1000)}`;
}

export function getEventGroupBySlug(slug: string): EventGroup | undefined {
  return DUMMY_EVENT_GROUPS.find((eg) => eg.slug === slug);
}
