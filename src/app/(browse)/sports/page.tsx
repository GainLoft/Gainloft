import pool from '@/lib/db';
import SportsClient from './SportsClient';

// ISR: serve from edge CDN, revalidate every 30s in background
export const revalidate = 30;

async function getInitialData() {
  // Read processed response directly from DB (~5ms, no HTTP round-trip)
  try {
    const { rows } = await pool.query(
      `SELECT data FROM api_cache WHERE key = 'sports_processed' AND updated_at > NOW() - INTERVAL '15 minutes'`
    );
    if (rows.length > 0) return rows[0].data;
  } catch {
    // Table may not exist yet
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
