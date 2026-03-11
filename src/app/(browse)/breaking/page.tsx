import BreakingClient from './BreakingClient';

export const revalidate = 300;

async function getBreakingData() {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.SITE_URL || 'http://localhost:3000');
    const res = await fetch(`${base}/api/polymarket/breaking`);
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

export default async function BreakingPage() {
  const data = await getBreakingData();
  return <BreakingClient initialData={data} />;
}
