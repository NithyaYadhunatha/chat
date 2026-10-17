'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { safeNext } from '@/components/auth';
import { BirthDateInput, ageFrom } from '@/components/birthdate';
import { Alert, Button, Checkbox, Field, Wordmark } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Me } from '@/lib/types';

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { me, setMe, signOut } = useSession();
  const [birth, setBirth] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasBirth = Boolean(me?.birth_date);
  const age = birth ? ageFrom(birth) : null;
  const ready = agree && (hasBirth || (age !== null && age >= 18));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Me>('/users/me/onboarding', {
        method: 'POST',
        body: { birth_date: birth || me?.birth_date, accept_rules: agree },
      });
      setMe(updated);
      router.replace(safeNext(params.get('next')));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <button onClick={() => signOut().then(() => router.replace('/'))} className="text-sm text-muted hover:text-fg">
          Log out
        </button>
      </header>
      <main className="flex flex-1 justify-center px-5 pb-16 pt-10 sm:pt-20">
        <form onSubmit={submit} className="w-full max-w-[380px] space-y-6">
          <div className="space-y-2">
            <p className="label">one last thing</p>
            <h1 className="text-2xl font-medium tracking-tight">Before you meet anyone</h1>
            <p className="text-sm leading-6 text-muted">
              This is an adults-only space. Confirm your age and agree to the rules to start chatting.
            </p>
          </div>

          {!hasBirth ? (
            <Field label="Date of birth" htmlFor="dob-day"
              error={age !== null && age < 18 ? 'You need to be 18 or older to chat with strangers.' : null}
              hint="You can’t change this later.">
              <BirthDateInput onChange={setBirth} />
            </Field>
          ) : null}

          <ul className="space-y-2 border-y border-line py-4 text-[13px] leading-5 text-muted">
            <li>— No sexual content, of any kind.</li>
            <li>— No harassment, hate or threats.</li>
            <li>— No sharing phone numbers, socials or links with strangers.</li>
            <li>— Messages are screened, and breaking rules gets you banned.</li>
          </ul>

          <Checkbox id="agree" checked={agree} onChange={setAgree}>
            I’m 18 or older and I agree to the{' '}
            <Link href="/rules" target="_blank" className="text-fg underline decoration-line-strong underline-offset-4">rules</Link>.
          </Checkbox>

          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={!ready} loading={busy}>
            Continue
          </Button>
        </form>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
