import CategoryGrid from '@/components/market/CategoryGrid';
import { localSlugToPmTag, slugToLabel, CATEGORY_MAP } from '@/lib/categories';
import { Market } from '@/lib/types';

export const revalidate = 300;

// Pre-render all known categories at build time → served from CDN, no function cold start
export async function generateStaticParams() {
  return Object.values(CATEGORY_MAP).map(slug => ({ category: slug }));
}

async function getCategoryData(tag: string): Promise<Market[]> {
  try {
    const base = process.env.SITE_URL || 'https://gainloft.com';
    const res = await fetch(`${base}/api/polymarket/events/live?tag=${encodeURIComponent(tag)}&limit=24&offset=0`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function DynamicCategoryPage({ params }: { params: { category: string } }) {
  const { category } = params;
  const label = slugToLabel(category);
  const pmTag = localSlugToPmTag(category);
  const markets = await getCategoryData(pmTag);

  return (
    <div style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 className="text-[28px] font-bold mb-6" style={{ color: 'var(--text-primary)' }}>{label}</h1>
      <CategoryGrid category={label} tag={pmTag} initialMarkets={markets} />
    </div>
  );
}
