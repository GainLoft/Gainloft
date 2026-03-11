/**
 * Sports sync scheduler — runs auto-sync every 10 minutes.
 * Starts on first import (server-side only).
 */

const SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

let started = false;

export function startSyncScheduler() {
  if (started || typeof window !== 'undefined') return; // server-side only, once
  started = true;

  console.log('[Sports Sync] Scheduler started — syncing every 10 minutes');

  // Initial sync after 30s delay (let server warm up)
  setTimeout(() => runSync(), 30_000);

  // Then every 10 minutes
  setInterval(() => runSync(), SYNC_INTERVAL);
}

async function runSync() {
  try {
    const secret = process.env.CRON_SECRET || '';
    const url = `${BASE_URL}/api/polymarket/sync/cron?mode=quick${secret ? `&secret=${secret}` : ''}`;
    console.log('[Sports Sync] Starting quick sync...');
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    console.log(`[Sports Sync] Done — synced=${data.totalSynced} duration=${data.duration}`);
  } catch (err) {
    console.error('[Sports Sync] Error:', err);
  }
}
