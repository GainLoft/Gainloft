import NewClient from './NewClient';
import { Market } from '@/lib/types';

export const revalidate = 300;

async function getNewData(): Promise<Market[]> {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.SITE_URL || 'http://localhost:3000');
    const res = await fetch(`${base}/api/polymarket/events?limit=24&order=newest`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function NewPage() {
  const markets = await getNewData();
  return <NewClient initialMarkets={markets} />;
}
