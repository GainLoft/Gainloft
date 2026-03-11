import BreakingClient from './BreakingClient';

export const revalidate = 300;

async function getBreakingData() {
  try {
    const base = process.env.SITE_URL || 'https://gainloft.com';
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
