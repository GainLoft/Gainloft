/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  compress: true,
  headers: async () => [
    {
      // ISR pages: Cloudflare caches 30s, browser caches 10s
      source: '/sports',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=10, s-maxage=30, stale-while-revalidate=60' },
        { key: 'CDN-Cache-Control', value: 'max-age=30' },
      ],
    },
    {
      // Static assets: immutable long-term cache
      source: '/_next/static/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      // API responses: Cloudflare caches 30s, browser 5s
      source: '/api/polymarket/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=5, s-maxage=30, stale-while-revalidate=60' },
        { key: 'CDN-Cache-Control', value: 'max-age=30' },
      ],
    },
  ],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
    };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
