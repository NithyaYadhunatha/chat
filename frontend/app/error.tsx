'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-5 py-20">
      <p className="label text-danger">something broke</p>
      <h1 className="text-3xl font-bold">That wasn&apos;t supposed to happen.</h1>
      <p className="text-sm leading-6 text-muted">
        Try again — if it keeps happening, reload the page.
        {error.digest ? <span className="mt-2 block font-mono text-xs text-faint">ref {error.digest}</span> : null}
      </p>
      <div className="flex gap-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <ButtonLink href="/">Home</ButtonLink>
      </div>
    </main>
  );
}
