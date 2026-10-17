'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { GoogleButton, useAfterAuth, useRedirectIfSignedIn } from '@/components/auth';
import { Alert, Button, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

function LoginForm() {
  useRedirectIfSignedIn();
  const signIn = useSession((s) => s.signIn);
  const after = useAfterAuth();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { access_token } = await api<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      after(await signIn(access_token));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium tracking-tight">Log in</h1>
        <p className="text-sm text-muted">Welcome back.</p>
      </div>

      {params.get('suspended') ? (
        <Alert tone="danger">This account has been suspended for breaking the rules.</Alert>
      ) : null}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className="field" />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className="field" />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!email || !password}>
          Log in
        </Button>
      </form>

      <GoogleButton />

      <p className="text-sm text-muted">
        New here?{' '}
        <Link href={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
          className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
