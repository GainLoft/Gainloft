'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TaxonomyItem {
  slug: string;
  label: string;
  count?: number;
}

export default function CategorySidebarClient({
  category,
  label,
  items,
  allCount,
}: {
  category: string;
  label: string;
  items: TaxonomyItem[];
  allCount?: number;
}) {
  const pathname = usePathname();
  const basePath = `/${category}`;
  const activeSub = pathname === basePath ? null : pathname.replace(`${basePath}/`, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* All */}
      <Link
        href={basePath}
        className="sidebar-sub-item"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: !activeSub ? 700 : 500,
          textDecoration: 'none',
          color: !activeSub ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: !activeSub ? 'var(--bg-hover)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <span>All</span>
        {allCount != null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
            {allCount}
          </span>
        )}
      </Link>

      {/* Subcategory items */}
      {items.map((item) => {
        const isActive = activeSub === item.slug;
        return (
          <Link
            key={item.slug}
            href={`${basePath}/${item.slug}`}
            className="sidebar-sub-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: isActive ? 700 : 500,
              textDecoration: 'none',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isActive ? 'var(--bg-hover)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <span>{item.label}</span>
            {item.count != null && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
