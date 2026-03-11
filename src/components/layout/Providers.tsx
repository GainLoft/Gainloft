'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from '@/config/wagmi';
import { useState, useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

const RainbowKitProviderWrapper = dynamic(
  () => import('./RainbowKitWrapper'),
  { ssr: false, loading: () => null }
);

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  }));
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {mounted ? (
          <RainbowKitProviderWrapper>{children}</RainbowKitProviderWrapper>
        ) : (
          children
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
