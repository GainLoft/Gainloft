import Script from 'next/script';
import NewClient from './NewClient';

export default function NewPage() {
  return (
    <>
      <Script id="prefetch-new" strategy="beforeInteractive">{`
        window.__NEW_PROMISE = fetch('/api/polymarket/events?limit=100&order=newest').then(function(r){return r.json()}).then(function(d){window.__NEW_DATA=d;return d});
      `}</Script>
      <NewClient />
    </>
  );
}
