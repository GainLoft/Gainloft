'use client';

import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import type { ReactNode } from 'react';

export default function RainbowKitWrapper({ children }: { children: ReactNode }) {
  return (
    <RainbowKitProvider
      theme={lightTheme({
        accentColor: '#1452f0',
        accentColorForeground: 'white',
        borderRadius: 'medium',
      })}
    >
      {children}
    </RainbowKitProvider>
  );
}
