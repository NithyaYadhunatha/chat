import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Press_Start_2P } from 'next/font/google';
import { APP_NAME, APP_TAGLINE } from '@/lib/config';
import './globals.css';

// Fonts are self-hosted by next/font at build time — no runtime request to Google.
// Arcade theme: a pixel face for scores and game states, a readable mono for everything else.
const pixel = Press_Start_2P({ subsets: ['latin'], weight: '400', variable: '--font-pixel', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-mono', display: 'swap' });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const DESCRIPTION = 'Anonymous one-on-one text chat with strangers. Adults only, moderated, no camera.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: { title: `${APP_NAME} — ${APP_TAGLINE}`, description: DESCRIPTION, siteName: APP_NAME, type: 'website' },
  twitter: { card: 'summary', title: APP_NAME, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pixel.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
