/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  compress: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.polymarket.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 'polymarket-upload.s3.us-east-2.amazonaws.com' },
    ],
    minimumCacheTTL: 86400, // Cache images for 24 hours
  },
  experimental: {
    optimizeCss: true, // Inlines critical CSS → eliminates render-blocking external CSS
  },
  headers: async () => [
    {
      // Sports page: no cache (force-dynamic, live data)
      source: '/sports',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'CDN-Cache-Control', value: 'no-cache, no-store' },
      ],
    },
    {
      // All static pages
      source: '/:path(|breaking|new|markets|games|leaderboard|portfolio|watchlist|rewards|help|docs|terms|apis|accuracy|activity)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=30, s-maxage=300, stale-while-revalidate=600' },
        { key: 'CDN-Cache-Control', value: 'max-age=600, stale-while-revalidate=3600' },
      ],
    },
    {
      // Category pages (all known categories)
      source: '/:category(politics|crypto|finance|geopolitics|tech|culture|economy|climate|mentions|elections|music|esports|iran|world|business|science)',
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
      // Public images (league logos, sport icons): cache for 7 days
      source: '/images/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
      ],
    },
    {
      // Optimized images: cache in browser for 1 hour
      source: '/_next/image',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
      ],
    },
    {
      // Sports API: short cache for live data
      source: '/api/polymarket/sports:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=5, s-maxage=10, stale-while-revalidate=30' },
        { key: 'CDN-Cache-Control', value: 'max-age=10, stale-while-revalidate=30' },
      ],
    },
    {
      // API responses (non-sports)
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
