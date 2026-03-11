import LeftSidebar from '@/components/layout/LeftSidebar';

async function getCategories() {
  try {
    const base = process.env.SITE_URL || 'https://gainloft.com';
    const res = await fetch(`${base}/api/polymarket/categories`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function BrowseLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategories();
  return (
    <div className="mx-auto max-w-[1400px] px-4 browse-layout" style={{ display: 'flex' }}>
      <LeftSidebar initialCategories={categories} />
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 24 }} className="browse-content">
        {children}
      </div>
    </div>
  );
}
