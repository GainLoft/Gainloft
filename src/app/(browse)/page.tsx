import Script from 'next/script';
import HomeClient from './HomeClient';

export default function HomePage() {
  return (
    <>
      <Script id="prefetch-home" strategy="beforeInteractive">{`
        window.__HOME_PROMISE = fetch('/api/polymarket/events?limit=50&order=volume24hr').then(function(r){return r.json()});
      `}</Script>
      <HomeClient />
    </>
  );
}
