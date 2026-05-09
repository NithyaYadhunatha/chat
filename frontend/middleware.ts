import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasRefreshToken = request.cookies.has('refresh_token');

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasRefreshToken && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasRefreshToken && isPublic) {
    return NextResponse.redirect(new URL('/conversations', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
};
