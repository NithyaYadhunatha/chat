'use client';

import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { GOOGLE_CLIENT_ID } from '@/lib/config';
import { useSession } from '@/lib/session';
import type { Me } from '@/lib/types';
import { Alert } from '@/components/ui';

/** Only allow same-site relative redirects (no "//evil.com"). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
}

export function useAfterAuth() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  return (me: Me) => {
    router.replace(me.needs_onboarding ? `/onboarding?next=${encodeURIComponent(next)}` : next);
  };
}

/** Sends already-signed-in visitors on to the app. */
export function useRedirectIfSignedIn() {
  const { status, me, bootstrap } = useSession();
  const after = useAfterAuth();
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    if (status === 'authenticated' && me) after(me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, me]);
  return status;
}

export function GoogleButton() {
  const signIn = useSession((s) => s.signIn);
  const after = useAfterAuth();
  const [error, setError] = useState<string | null>(null);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-2xs uppercase tracking-[0.12em] text-faint">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="flex justify-center [color-scheme:light]">
          <GoogleLogin
            theme="filled_black"
            shape="rectangular"
            text="continue_with"
            width="360"
            onSuccess={async ({ credential }) => {
              setError(null);
              try {
                const { access_token } = await api<{ access_token: string }>('/auth/google', {
                  method: 'POST',
                  body: { credential },
                });
                after(await signIn(access_token));
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
            onError={() => setError('Google sign-in was cancelled or failed.')}
          />
        </div>
      </GoogleOAuthProvider>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
