import SportsClient from './SportsClient';

// ISR: serve from edge CDN, revalidate every 30s in background
export const revalidate = 30;

async function getInitialData() {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    const res = await fetch(`${base}/api/polymarket/sports?tab=live&offset=0&limit=30`);
    if (res.ok) return res.json();
  } catch {}

  return null;
}

export default async function SportsPage() {
  const data = await getInitialData();

  return (
    <SportsClient
      initialEvents={data?.events ?? []}
      initialTaxonomy={data?.taxonomy ?? []}
      initialHasMore={data?.hasMore ?? false}
      initialTotal={data?.total ?? 0}
    />
  );
}
