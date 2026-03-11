import { http, createConfig, createStorage, cookieStorage } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [polygon],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'GainLoft' }),
  ],
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
  transports: {
    [polygon.id]: http(),
  },
});
