/** @type {import('next').NextConfig} */

// The browser talks to the API through /api on this origin. That keeps the
// refresh-token cookie first-party (httpOnly, SameSite) even when the API is
// hosted somewhere else. Only the WebSocket connects to the backend directly.
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
const isDev = process.env.NODE_ENV !== 'production';
const httpsSite = (process.env.NEXT_PUBLIC_SITE_URL || '').startsWith('https://');

// Fail the production build on settings that would ship an insecure app.
if (!isDev) {
  const ws = new URL(WS_URL);
  const local = ['localhost', '127.0.0.1'].includes(ws.hostname);
  if (ws.protocol !== 'wss:' && !local) {
    throw new Error(`NEXT_PUBLIC_WS_URL must use wss:// in production (got ${WS_URL})`);
  }
  if (!process.env.BACKEND_URL) {
    console.warn('[pingpong] BACKEND_URL is not set — the /api proxy will point at http://localhost:8000');
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: https://*.googleusercontent.com",
  "font-src 'self'",
  `connect-src 'self' ${new URL(WS_URL).origin} https://accounts.google.com`,
  'frame-src https://accounts.google.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(httpsSite ? ['upgrade-insecure-requests'] : []),
].join('; ');

const nextConfig = {
  output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          ...(!httpsSite ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
        ],
      },
    ];
  },
};

export default nextConfig;
