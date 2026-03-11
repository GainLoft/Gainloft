import SportsClient from './SportsClient';
import { EventGroup } from '@/lib/types';

export const revalidate = 300;

interface SportsData {
  events: EventGroup[];
  taxonomy: { slug: string; label: string; count: number; leagues: { slug: string; label: string; count: number }[] }[];
  hasMore: boolean;
  total: number;
}

async function getSportsData(): Promise<SportsData> {
  try {
    const base = process.env.SITE_URL || 'https://gainloft.com';
    const res = await fetch(`${base}/api/polymarket/sports?tab=live&offset=0&limit=30`);
    if (!res.ok) return { events: [], taxonomy: [], hasMore: false, total: 0 };
    const data = await res.json();
    return {
      events: data.events || [],
      taxonomy: data.taxonomy || [],
      hasMore: data.hasMore ?? false,
      total: data.total ?? 0,
    };
  } catch {
    return { events: [], taxonomy: [], hasMore: false, total: 0 };
  }
}

export default async function SportsPage() {
  const data = await getSportsData();
  return (
    <SportsClient
      initialEvents={data.events}
      initialTaxonomy={data.taxonomy}
      initialHasMore={data.hasMore}
      initialTotal={data.total}
    />
  );
}
