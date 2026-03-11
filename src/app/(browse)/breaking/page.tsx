import Script from 'next/script';
import BreakingClient from './BreakingClient';

export default function BreakingPage() {
  return (
    <>
      <Script id="prefetch-breaking" strategy="beforeInteractive">{`
        window.__BREAKING_PROMISE = fetch('/api/polymarket/breaking').then(function(r){return r.json()});
      `}</Script>
      <BreakingClient />
    </>
  );
}
