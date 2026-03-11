/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  compress: true,
  headers: async () => [
    {
      // ISR pages: allow browser to cache for 10s, CDN for 30s
      source: '/sports',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=10, s-maxage=30, stale-while-revalidate=60' },
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
      // API responses: short browser cache + CDN cache
      source: '/api/polymarket/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=5, s-maxage=30, stale-while-revalidate=60' },
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
