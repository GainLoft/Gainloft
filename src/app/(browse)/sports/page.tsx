import SportsClient from './SportsClient';

export default function SportsPage() {
  return (
    <SportsClient
      initialEvents={[]}
      initialTaxonomy={[]}
      initialHasMore={false}
      initialTotal={0}
    />
  );
}
