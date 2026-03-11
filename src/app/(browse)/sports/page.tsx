import SportsClient from './SportsClient';

export const dynamic = 'force-dynamic';

async function fetchInitialData() {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    const res = await fetch(`${base}/api/polymarket/sports?tab=live&offset=0&limit=30`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SportsPage() {
  const data = await fetchInitialData();

  return (
    <SportsClient
      initialEvents={data?.events ?? []}
      initialTaxonomy={data?.taxonomy ?? []}
      initialHasMore={data?.hasMore ?? false}
      initialTotal={data?.total ?? 0}
    />
  );
}
