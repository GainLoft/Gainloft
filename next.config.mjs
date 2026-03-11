/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  compress: true,
  headers: async () => [
    {
      // All static pages: CDN caches 5 min, browser 30s, stale OK for 10 min
      source: '/:path(|sports|breaking|new|markets|games|leaderboard|portfolio|watchlist|rewards|help|docs|terms|apis)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=30, s-maxage=300, stale-while-revalidate=600' },
        { key: 'CDN-Cache-Control', value: 'max-age=300' },
      ],
    },
    {
      // Category pages
      source: '/:category(politics|crypto|sports|business|science|culture|world)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=30, s-maxage=300, stale-while-revalidate=600' },
        { key: 'CDN-Cache-Control', value: 'max-age=300' },
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
      // API responses: Cloudflare caches 5 min, stale OK for 10 min
      source: '/api/polymarket/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=10, s-maxage=300, stale-while-revalidate=600' },
        { key: 'CDN-Cache-Control', value: 'max-age=300' },
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
