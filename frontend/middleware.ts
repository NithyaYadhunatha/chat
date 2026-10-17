import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Fast path only: if there's no refresh cookie at all, skip loading the app and
// go straight to sign-in. The real check happens client-side via /auth/refresh.
export function middleware(request: NextRequest) {
  if (!request.cookies.has('rt')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/chat/:path*', '/messages/:path*', '/friends/:path*', '/settings/:path*', '/admin/:path*', '/onboarding'],
};
