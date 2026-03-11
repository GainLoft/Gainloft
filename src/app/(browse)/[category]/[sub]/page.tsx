'use client';

import SubcategoryPage from '@/components/market/SubcategoryPage';
import { useParams } from 'next/navigation';
import { localSlugToPmTag, slugToLabel } from '@/lib/categories';

export default function DynamicSubPage() {
  const params = useParams();
  const category = params.category as string;
  const label = slugToLabel(category);
  const pmTag = localSlugToPmTag(category);

  return <SubcategoryPage parentCategory={category} parentLabel={label} parentTag={pmTag} />;
}
