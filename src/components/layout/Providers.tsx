'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from '@/config/wagmi';
import { useState, useEffect, startTransition, type ReactNode, type ComponentType } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  }));
  const [RKWrapper, setRKWrapper] = useState<ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    import('./RainbowKitWrapper').then(mod => {
      startTransition(() => {
        setRKWrapper(() => mod.default);
      });
    });
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {RKWrapper ? <RKWrapper>{children}</RKWrapper> : children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
