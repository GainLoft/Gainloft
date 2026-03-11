import HomeClient from './HomeClient';
import { Market } from '@/lib/types';

export const revalidate = 300; // ISR: regenerate every 5 min

async function getHomeData(): Promise<Market[]> {
  try {
    const base = process.env.SITE_URL || 'https://gainloft.com';
    const res = await fetch(`${base}/api/polymarket/events?limit=24&order=volume24hr`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const markets = await getHomeData();
  return <HomeClient initialMarkets={markets} />;
}
