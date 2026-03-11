import SubcategoryPage from '@/components/market/SubcategoryPage';
import { localSlugToPmTag, slugToLabel } from '@/lib/categories';

export const revalidate = 300;

export default async function DynamicSubPage({ params }: { params: { category: string; sub: string } }) {
  const { category } = params;
  const label = slugToLabel(category);
  const pmTag = localSlugToPmTag(category);

  return <SubcategoryPage parentCategory={category} parentLabel={label} parentTag={pmTag} />;
}
