import Link from 'next/link';
import { localSlugToPmTag, slugToLabel } from '@/lib/categories';
import CategorySidebarClient from './CategorySidebarClient';

export const revalidate = 300;

interface TaxonomyItem {
  slug: string;
  label: string;
  count?: number;
}

async function getTaxonomy(category: string): Promise<{ items: TaxonomyItem[]; allCount?: number }> {
  try {
    const base = process.env.SITE_URL || 'https://gainloft.com';
    const pmTag = localSlugToPmTag(category);
    const res = await fetch(
      `${base}/api/polymarket/taxonomy?category=${encodeURIComponent(category)}&pmPath=${encodeURIComponent('/' + pmTag)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return { items: [] };
    const data = await res.json();
    return { items: data.items || [], allCount: data.allCount };
  } catch {
    return { items: [] };
  }
}

export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { category: string };
}) {
  const { category } = params;
  const taxonomy = await getTaxonomy(category);
  const label = slugToLabel(category);

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Sidebar */}
      <aside className="category-sidebar" style={{ width: 200, flexShrink: 0, paddingTop: 24 }}>
        <nav style={{ position: 'sticky', top: 72 }}>
          <CategorySidebarClient
            category={category}
            label={label}
            items={taxonomy.items}
            allCount={taxonomy.allCount}
          />
        </nav>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
