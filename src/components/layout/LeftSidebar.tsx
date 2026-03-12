'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';

const swrFetcher = (url: string) => fetch(url).then(r => r.json());

interface CategoryItem {
  slug: string;
  label: string;
  pmTag: string;
  pmPath: string;
}

interface SubItem {
  slug: string;
  label: string;
  count?: number;
}

interface TaxonomyResponse {
  category: string;
  items: SubItem[];
  allCount?: number;
}

// Static nav items (not categories)
const TOP_NAV: { icon: string; label: string; href: string }[] = [
  { icon: 'trending', label: 'Trending', href: '/' },
  { icon: 'zap', label: 'Breaking', href: '/breaking' },
  { icon: 'sparkle', label: 'New', href: '/new' },
];

const BOTTOM_NAV: { icon: string; label: string; href: string }[] = [
  { icon: 'trophy', label: 'Leaderboard', href: '/leaderboard' },
  { icon: 'bookmark', label: 'Watchlist', href: '/watchlist' },
  { icon: 'chart', label: 'Activity', href: '/activity' },
];

// Icon map for known categories (new categories get generic icon)
const CATEGORY_ICONS: Record<string, string> = {
  politics: 'landmark',
  sports: 'football',
  crypto: 'bitcoin',
  finance: 'banknote',
  geopolitics: 'globe',
  tech: 'cpu',
  esports: 'gamepad',
  culture: 'palette',
  'pop-culture': 'palette',
  economy: 'banknote',
  climate: 'globe',
  'climate-science': 'globe',
  elections: 'landmark',
  iran: 'globe',
  music: 'palette',
  mentions: 'zap',
  'mention-markets': 'zap',
  games: 'gamepad',
};

function getIcon(slug: string, pmTag: string): string {
  return CATEGORY_ICONS[slug] || CATEGORY_ICONS[pmTag] || 'dot';
}

function SidebarIcon({ name, size = 18 }: { name: string; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (name) {
    case 'trending': return (
      <svg {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
    );
    case 'zap': return (
      <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
    );
    case 'sparkle': return (
      <svg {...props}><path d="M12 3v18M5.6 5.6l12.8 12.8M3 12h18M5.6 18.4l12.8-12.8" strokeWidth={1.5} /><circle cx="12" cy="12" r="3" strokeWidth={1.5} /></svg>
    );
    case 'landmark': return (
      <svg {...props}><path d="M3 21h18M3 10h18M5 6l7-3 7 3" /><path d="M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11" /></svg>
    );
    case 'football': return (
      <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /><path d="M2 12h20" /></svg>
    );
    case 'bitcoin': return (
      <svg {...props}><path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042l-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893l-6.57-1.158m6.57 1.158l.348-1.97M7.075 11.89l-1.216-.214m9.063-5.69l-.348 1.97M7.075 11.89l5.907 1.042m-5.56-7.808l-.347 1.97" /></svg>
    );
    case 'banknote': return (
      <svg {...props}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg>
    );
    case 'globe': return (
      <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
    );
    case 'cpu': return (
      <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></svg>
    );
    case 'gamepad': return (
      <svg {...props}><path d="M6 12h4M8 10v4" /><line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" /><path d="M17.32 5H6.68a4 4 0 00-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 003 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 019.828 16h4.344a2 2 0 011.414.586L17 18c.5.5 1 1 2 1a3 3 0 003-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0017.32 5z" /></svg>
    );
    case 'palette': return (
      <svg {...props}><circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" /></svg>
    );
    case 'trophy': return (
      <svg {...props}><path d="M8 21h8M12 17v4" /><path d="M7 4h10v7a5 5 0 01-10 0V4z" /><path d="M7 4H4v2a3 3 0 003 3" /><path d="M17 4h3v2a3 3 0 01-3 3" /></svg>
    );
    case 'bookmark': return (
      <svg {...props}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>
    );
    case 'chart': return (
      <svg {...props}><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
    );
    case 'back': return (
      <svg {...props}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
    );
    case 'dot': return (
      <svg width={6} height={6} viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="currentColor" /></svg>
    );
    default: return null;
  }
}

export default function LeftSidebar({ initialCategories = [] }: { initialCategories?: CategoryItem[] }) {
  const pathname = usePathname();
  const isSports = pathname.startsWith('/sports');

  // Use server-provided categories directly (refreshed via ISR revalidation)
  const categories = initialCategories;

  // Determine current path context
  const pathParts = pathname.split('/').filter(Boolean);
  const basePath = `/${pathParts[0] || ''}`;
  const activeSub = pathParts[1] || null;

  // Find current category match from server-provided data
  const categoryMatch = categories.find(c => `/${c.slug}` === basePath);
  const taxonomyKey = isSports ? undefined : categoryMatch?.pmTag;
  const pmPath = categoryMatch?.pmPath;
  const categoryLabel = categoryMatch?.label;

  // Fetch sidebar subcategory items when on a category page
  const { data: taxonomyData } = useSWR<TaxonomyResponse>(
    taxonomyKey
      ? `/api/polymarket/taxonomy?category=${encodeURIComponent(categoryMatch!.slug)}${pmPath ? `&pmPath=${encodeURIComponent(pmPath)}` : ''}`
      : null,
    swrFetcher,
    { refreshInterval: 120000, revalidateOnFocus: true, dedupingInterval: 60000 }
  );

  // Pages with their own sidebar — don't render global sidebar
  if (isSports) return null;

  const subcategories: SubItem[] = taxonomyData?.items || [];

  // Show subcategory sidebar when on a category page (even while taxonomy loads)
  if (taxonomyKey) {
    return (
      <aside className="left-sidebar" style={{ width: 200, flexShrink: 0, paddingTop: 20 }}>
        <nav style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Back to main nav */}
          <Link
            href={basePath}
            className="sidebar-nav-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}
          >
            <SidebarIcon name="back" size={14} />
            {categoryLabel}
          </Link>

          <div style={{ height: 1, background: 'var(--border-light)', margin: '0 10px 6px' }} />

          {/* "All" item */}
          <Link
            href={basePath}
            className="sidebar-nav-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: !activeSub ? 600 : 500,
              textDecoration: 'none',
              color: !activeSub ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: !activeSub ? 'var(--bg-hover)' : 'transparent',
            }}
          >
            <span>All</span>
            {taxonomyData?.allCount != null && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {taxonomyData.allCount}
              </span>
            )}
          </Link>

          {/* Subcategory items */}
          {subcategories.map((item) => {
            const isActive = activeSub === item.slug;
            return (
              <Link
                key={item.slug}
                href={`${basePath}/${item.slug}`}
                className="sidebar-nav-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  textDecoration: 'none',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                }}
              >
                <span>{item.label}</span>
                {item.count != null && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    );
  }

  // Default: main navigation sidebar
  return (
    <aside className="left-sidebar" style={{ width: 200, flexShrink: 0, paddingTop: 20 }}>
      <nav style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Top static nav items */}
        {TOP_NAV.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-nav-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                textDecoration: 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span style={{
                width: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
                <SidebarIcon name={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}

        <div style={{ height: 1, background: 'var(--border-light)', margin: '8px 10px' }} />

        {/* Dynamic category items from Polymarket */}
        {categories.map((cat) => {
          const href = `/${cat.slug}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          const icon = getIcon(cat.slug, cat.pmTag);
          return (
            <Link
              key={cat.slug}
              href={href}
              className="sidebar-nav-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                textDecoration: 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span style={{
                width: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
                <SidebarIcon name={icon} />
              </span>
              {cat.label}
            </Link>
          );
        })}

        <div style={{ height: 1, background: 'var(--border-light)', margin: '8px 10px' }} />

        {/* Bottom static nav items */}
        {BOTTOM_NAV.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-nav-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                textDecoration: 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span style={{
                width: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
                <SidebarIcon name={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
