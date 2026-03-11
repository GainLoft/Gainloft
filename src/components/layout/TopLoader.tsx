'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function TopLoader() {
  const pathname = usePathname();
  const [state, setState] = useState<'idle' | 'loading' | 'finishing'>('idle');
  const prevPath = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // On link click → start loading
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || anchor.target === '_blank') return;
      if (href === prevPath.current) return;
      setState('loading');
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // On pathname change → finish loading
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      setState('finishing');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setState('idle'), 400);
    }
    return () => clearTimeout(timerRef.current);
  }, [pathname]);

  // Safety timeout — if page takes too long, auto-finish after 8s
  useEffect(() => {
    if (state === 'loading') {
      const t = setTimeout(() => {
        setState('finishing');
        setTimeout(() => setState('idle'), 400);
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state === 'idle') return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      zIndex: 9999,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      <div
        className={state === 'loading' ? 'toploader-bar' : 'toploader-done'}
        style={{
          height: '100%',
          background: 'var(--brand-blue)',
          boxShadow: '0 0 8px var(--brand-blue)',
        }}
      />
    </div>
  );
}
