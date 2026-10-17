'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, InterestInput, Kbd } from '@/components/ui';

export const PENDING_INTERESTS_KEY = 'pending-interests';

export function LiveCount() {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/stranger/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setOnline(d.online))
        .catch(() => {});
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <p className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
      <span className={online ? 'h-2 w-2 animate-blink bg-ok' : 'h-2 w-2 bg-line-strong'} />
      players online
      <span className="pixel text-[11px] text-fg">{online === null ? '--' : String(online).padStart(3, '0')}</span>
    </p>
  );
}

export function StartPanel() {
  const router = useRouter();
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const start = () => {
    setBusy(true);
    try {
      sessionStorage.setItem(PENDING_INTERESTS_KEY, JSON.stringify(interests));
    } catch {
      // Private mode etc. — interests are optional.
    }
    router.push('/chat?start=1');
  };

  return (
    <div className="w-full max-w-lg space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="label">talk about (optional)</span>
      </div>
      <InterestInput value={interests} onChange={setInterests} placeholder="music, films, chess…" />
      <div className="flex flex-wrap items-center gap-4 pt-3">
        <Button variant="primary" size="lg" onClick={start} loading={busy}>
          Press start
        </Button>
        <span className="hidden items-center gap-2 text-xs text-faint sm:flex">
          <Kbd>Esc</Kbd><Kbd>Esc</Kbd> skips to the next player
        </span>
      </div>
    </div>
  );
}
