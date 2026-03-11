import Script from 'next/script';
import SportsClient from './SportsClient';

export default function SportsPage() {
  return (
    <>
      {/* Start API fetch immediately, before JS bundles load */}
      <Script id="prefetch-sports" strategy="beforeInteractive">{`
        window.__SPORTS_PROMISE = fetch('/api/polymarket/sports-fast?tab=live&offset=0&limit=30').then(function(r){return r.json()}).then(function(d){window.__SPORTS_DATA=d;return d});
      `}</Script>
      <SportsClient
        initialEvents={[]}
        initialTaxonomy={[]}
        initialHasMore={false}
        initialTotal={0}
      />
    </>
  );
}
