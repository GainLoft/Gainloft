'use client';

import { useParams } from 'next/navigation';
import CategoryGrid from '@/components/market/CategoryGrid';
import { localSlugToPmTag, slugToLabel } from '@/lib/categories';

export default function DynamicCategoryPage() {
  const params = useParams();
  const category = params.category as string;
  const label = slugToLabel(category);
  const pmTag = localSlugToPmTag(category);

  return (
    <div style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 className="text-[28px] font-bold mb-6" style={{ color: 'var(--text-primary)' }}>{label}</h1>
      <CategoryGrid category={label} tag={pmTag} />
    </div>
  );
}
