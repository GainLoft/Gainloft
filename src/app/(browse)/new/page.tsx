import NewClient from './NewClient';
import { Market } from '@/lib/types';

export const revalidate = 300;

async function getNewData(): Promise<Market[]> {
  try {
    const base = process.env.SITE_URL || 'https://gainloft.com';
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
