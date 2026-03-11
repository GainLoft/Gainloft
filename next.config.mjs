/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  compress: true,
  experimental: {
    optimizeCss: true, // Inlines critical CSS → eliminates render-blocking external CSS
  },
  headers: async () => [
    {
      // All static pages
      source: '/:path(|sports|breaking|new|markets|games|leaderboard|portfolio|watchlist|rewards|help|docs|terms|apis|accuracy|activity)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=30, s-maxage=300, stale-while-revalidate=600' },
        { key: 'CDN-Cache-Control', value: 'max-age=600, stale-while-revalidate=3600' },
      ],
    },
    {
      // Category pages (all known categories)
      source: '/:category(politics|crypto|sports|finance|geopolitics|tech|culture|economy|climate|mentions|elections|music|esports|iran|world|business|science)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=30, s-maxage=300, stale-while-revalidate=600' },
        { key: 'CDN-Cache-Control', value: 'max-age=600, stale-while-revalidate=3600' },
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
      // API responses
      source: '/api/polymarket/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=10, s-maxage=300, stale-while-revalidate=600' },
        { key: 'CDN-Cache-Control', value: 'max-age=300, stale-while-revalidate=3600' },
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
