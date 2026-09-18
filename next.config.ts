import type { NextConfig } from 'next'

// ponytail: no custom webpack, no bundle analyser, no image CDN. The ordering page's
// 100 KB JS budget is defended by writing server components, not by build configuration.
const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default nextConfig
