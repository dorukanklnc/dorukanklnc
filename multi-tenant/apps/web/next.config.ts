import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * The browser only talks to this origin (ADR-0011): `/api/*` is proxied to the API so session
 * cookies stay first-party. In production a load balancer can route `/api/*` directly instead.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@repo/ui'],
  typedRoutes: false,
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
  headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ...(isProduction
        ? [
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=63072000; includeSubDomains; preload',
            },
          ]
        : []),
    ];
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
