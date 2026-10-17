'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, InterestInput, Modal, Spinner, useConfirm } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { banText, relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { socket } from '@/lib/socket';
import type { Me } from '@/lib/types';

function Block({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-8 md:grid-cols-[14rem_1fr] md:gap-10">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-5 text-faint">{description}</p> : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

type Status = { tone: 'ok' | 'danger'; text: string } | null;

function ProfileBlock({ me }: { me: Me }) {
  const setMe = useSession((s) => s.setMe);
  const [username, setUsername] = useState(me.username);
  const [interests, setInterests] = useState(me.interests);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const dirty = username !== me.username || interests.join('|') !== me.interests.join('|');

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const updated = await api<Me>('/users/me', { method: 'PATCH', body: { username, interests } });
      setMe(updated);
      setInterests(updated.interests);
      setStatus({ tone: 'ok', text: 'Saved.' });
    } catch (e) {
      setStatus({ tone: 'danger', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block title="Profile" description="Your username is only shown to friends. Strangers never see it.">
      <Field label="Username" htmlFor="username">
        <input id="username" value={username} maxLength={20} onChange={(e) => setUsername(e.target.value)} className="field max-w-xs font-mono" />
      </Field>
      <Field label="Default interests" hint="Used to match you when you start a chat. Up to 5.">
        <InterestInput value={interests} onChange={setInterests} />
      </Field>
      <dl className="grid max-w-sm grid-cols-[7rem_1fr] gap-y-1 font-mono text-xs">
        <dt className="text-faint">email</dt><dd className="truncate text-muted">{me.email}</dd>
        <dt className="text-faint">born</dt><dd className="text-muted">{me.birth_date ?? '—'}</dd>
        <dt className="text-faint">member for</dt><dd className="text-muted">{relativeTime(me.created_at)}</dd>
      </dl>
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Button variant="primary" size="sm" onClick={save} disabled={!dirty} loading={busy}>Save changes</Button>
    </Block>
  );
}

function StandingBlock({ me }: { me: Me }) {
  const ban = me.chat_ban;
  return (
    <Block title="Account standing" description="Strikes come from breaking the rules and fade over time.">
      {ban.banned ? (
        <Alert tone="danger">
          {ban.age_review
            ? 'Stranger chat is paused until a moderator confirms you’re 18 or older.'
            : `Stranger chat is paused ${banText(ban.until, ban.permanent)}${ban.reason ? ` — ${ban.reason}` : ''}.`}
        </Alert>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="h-1.5 w-1.5 bg-ok" /> In good standing.
        </p>
      )}
    </Block>
  );
}

function BlockedBlock() {
  const [blocks, setBlocks] = useState<{ id: string; source: string; username: string | null; created_at: string }[] | null>(null);
  useEffect(() => {
    api<typeof blocks>('/users/blocks').then(setBlocks).catch(() => setBlocks([]));
  }, []);

  const unblock = async (id: string) => {
    await api(`/users/blocks/${id}`, { method: 'DELETE' }).catch(() => {});
    setBlocks((b) => b?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <Block title="Blocked" description="Blocked people can’t message you and won’t be matched with you.">
      {blocks === null ? (
        <Spinner />
      ) : blocks.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm">{b.username ?? 'Anonymous stranger'}</p>
                <p className="font-mono text-2xs text-faint">blocked {relativeTime(b.created_at)} ago</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => unblock(b.id)}>Unblock</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-faint">You haven’t blocked anyone.</p>
      )}
    </Block>
  );
}

function SecurityBlock({ me }: { me: Me }) {
  const router = useRouter();
  const signOut = useSession((s) => s.signOut);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const { ask, dialog } = useConfirm();

  const leave = async (path = '/') => {
    socket.stop();
    await signOut();
    router.replace(path);
  };

  const changePassword = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await api('/users/me/password', { method: 'POST', body: { current_password: current || null, new_password: next } });
      setStatus({ tone: 'ok', text: 'Password changed. Signing you out everywhere…' });
      setTimeout(() => void leave('/login'), 1200);
    } catch (e) {
      setStatus({ tone: 'danger', text: errorMessage(e) });
      setBusy(false);
    }
  };

  return (
    <Block title="Security">
      {dialog}
      <div className="max-w-xs space-y-3">
        {me.has_password ? (
          <Field label="Current password" htmlFor="pw-current">
            <input id="pw-current" type="password" autoComplete="current-password" value={current}
              onChange={(e) => setCurrent(e.target.value)} className="field" />
          </Field>
        ) : null}
        <Field label={me.has_password ? 'New password' : 'Set a password'} htmlFor="pw-new" hint="8+ characters.">
          <input id="pw-new" type="password" autoComplete="new-password" value={next}
            onChange={(e) => setNext(e.target.value)} className="field" />
        </Field>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        <Button size="sm" onClick={changePassword} disabled={next.length < 8 || (me.has_password && !current)} loading={busy}>
          {me.has_password ? 'Change password' : 'Set password'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={() => leave()}>Log out</Button>
        <Button size="sm" variant="ghost" onClick={async () => {
          const ok = await ask({ title: 'Log out everywhere?', body: 'Every device signed in to this account will be signed out, including this one.', confirmLabel: 'Log out everywhere' });
          if (!ok) return;
          await api('/users/me/logout-all', { method: 'POST' }).catch(() => {});
          await leave('/login');
        }}>
          Log out everywhere
        </Button>
      </div>
    </Block>
  );
}

function DeleteBlock({ me }: { me: Me }) {
  const router = useRouter();
  const signOut = useSession((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/users/me', { method: 'DELETE', body: { confirm: confirmName, password: password || null } });
      socket.stop();
      await signOut();
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Block title="Delete account" description="Removes your profile, friends and direct messages. This can’t be undone.">
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>Delete account…</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account">
        <div className="space-y-4">
          <p className="text-[13px] leading-5 text-muted">
            Type <span className="font-mono text-fg">{me.username}</span> to confirm. Reports and moderation records
            about this account are kept for safety reasons.
          </p>
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} className="field font-mono" aria-label="Username" />
          {me.has_password ? (
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
              className="field" aria-label="Password" />
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={busy} disabled={confirmName !== me.username}>
              Delete forever
            </Button>
          </div>
        </div>
      </Modal>
    </Block>
  );
}

export default function SettingsPage() {
  const me = useSession((s) => s.me)!;
  const reloadMe = useSession((s) => s.reloadMe);
  useEffect(() => {
    void reloadMe();
  }, [reloadMe]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex h-16 items-center border-b border-line px-5 sm:px-8">
        <h1 className="pixel text-[13px]">Settings</h1>
      </div>
      <div className="mx-auto max-w-4xl px-5 pb-16 sm:px-8">
        <ProfileBlock key={me.username} me={me} />
        <StandingBlock me={me} />
        <BlockedBlock />
        <SecurityBlock me={me} />
        <DeleteBlock me={me} />
      </div>
    </div>
  );
}
