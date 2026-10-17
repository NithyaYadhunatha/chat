'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { GoogleButton, useAfterAuth, useRedirectIfSignedIn } from '@/components/auth';
import { BirthDateInput, ageFrom } from '@/components/birthdate';
import { Alert, Button, Checkbox, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

function RegisterForm() {
  useRedirectIfSignedIn();
  const signIn = useSession((s) => s.signIn);
  const after = useAfterAuth();
  const params = useSearchParams();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState('');
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const age = birth ? ageFrom(birth) : null;
  const problems = {
    username: username && !USERNAME.test(username) ? '3–20 characters: letters, numbers, underscores.' : null,
    password: password && password.length < 8 ? 'At least 8 characters.' : null,
    birth: age !== null && age < 18 ? 'You need to be 18 or older to use this service.' : null,
  };
  const ready = USERNAME.test(username) && email.includes('@') && password.length >= 8 && age !== null && age >= 18 && agree;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const { access_token } = await api<{ access_token: string }>('/auth/register', {
        method: 'POST',
        body: { username, email: email.trim(), password, birth_date: birth, accept_rules: agree },
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
        <h1 className="text-2xl font-medium tracking-tight">Create an account</h1>
        <p className="text-sm text-muted">Strangers never see any of this. It keeps the place adults-only and lets bans stick.</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Username" htmlFor="username" error={problems.username} hint="Only shown to people you add as friends.">
          <input id="username" autoComplete="username" value={username} maxLength={20}
            onChange={(e) => setUsername(e.target.value)} className="field font-mono" />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className="field" />
        </Field>
        <Field label="Password" htmlFor="password" error={problems.password} hint="8+ characters. Mix letters with numbers or symbols.">
          <input id="password" type="password" autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className="field" />
        </Field>
        <Field label="Date of birth" htmlFor="dob-day" error={problems.birth}
          hint={touched && !birth ? <span className="text-danger">Enter your date of birth.</span> : 'You can’t change this later.'}>
          <BirthDateInput onChange={setBirth} />
        </Field>
        <div className="pt-1">
          <Checkbox id="agree" checked={agree} onChange={setAgree}>
            I’m 18 or older and I agree to the{' '}
            <Link href="/rules" target="_blank" className="text-fg underline decoration-line-strong underline-offset-4">rules</Link>
            : no sexual content, no harassment, no sharing contact details with strangers.
          </Checkbox>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={touched && !ready}>
          Create account
        </Button>
      </form>

      <GoogleButton />

      <p className="text-sm text-muted">
        Already have an account?{' '}
        <Link href={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
          className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
