import pool from '@/lib/db';
import SportsClient from './SportsClient';

// ISR: serve from edge CDN, revalidate every 30s in background
export const revalidate = 30;

async function getInitialData() {
  // Read precomputed cache directly from DB (no HTTP round-trip)
  try {
    const { rows } = await pool.query(
      `SELECT data FROM api_cache WHERE key = 'sports_live' AND updated_at > NOW() - INTERVAL '15 minutes'`
    );
    if (rows.length > 0) return rows[0].data;
  } catch {
    // Table may not exist yet (created on first cron run)
  }
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
