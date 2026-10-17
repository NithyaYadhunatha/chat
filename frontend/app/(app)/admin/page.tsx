'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Spinner, useConfirm } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { clockTime, relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';

// ── Types (admin-only API shapes) ────────────────────────────────────────────

interface UserSummary {
  id: string; username: string; email: string; role: string; created_at: string;
  strike_points: number; report_count: number; is_suspended: boolean; age_review_required: boolean;
  chat_banned: boolean; chat_banned_until: string | null; chat_ban_permanent: boolean; ban_reason: string | null;
  is_online: boolean;
}
interface ModEvent {
  id: string; user_id: string; source: string; category: string; severity: string; action: string;
  detail: string | null; excerpt: string | null; created_at: string; username?: string;
}
interface ReportRow {
  id: string; source: string; reason: string; details: string | null; priority: number; status: string;
  created_at: string; reported: UserSummary | null; reporter: { id: string; username: string } | null;
  evidence_count: number; resolution_note: string | null;
}
interface ReportDetail extends ReportRow {
  evidence: { author: string; text: string; at: string; blocked: boolean }[];
  history: ModEvent[];
  other_reports: number;
}
interface Stats {
  open_reports: number; urgent_reports: number; events_24h: number; suspended_users: number;
  age_reviews: number; online: number; active_chats: number;
}

const REASON_LABEL: Record<string, string> = {
  sexual: 'Sexual content', minor: 'Possible minor', harassment: 'Harassment', threats: 'Threats',
  self_harm: 'Self-harm', spam: 'Spam', other: 'Other',
};

const ACTIONS: { value: string; label: string; danger?: boolean }[] = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'warn', label: 'Warn' },
  { value: 'ban_24h', label: 'Ban 24h' },
  { value: 'ban_7d', label: 'Ban 7 days' },
  { value: 'ban_permanent', label: 'Ban from stranger chat', danger: true },
  { value: 'suspend', label: 'Suspend account', danger: true },
];

function Priority({ p }: { p: number }) {
  if (p >= 3) return <span className=" bg-danger/15 px-1.5 py-px font-mono text-2xs text-danger">urgent</span>;
  if (p === 2) return <span className=" bg-warn/15 px-1.5 py-px font-mono text-2xs text-warn">high</span>;
  return <span className=" bg-raised px-1.5 py-px font-mono text-2xs text-faint">normal</span>;
}

function UserFacts({ u }: { u: UserSummary }) {
  const flags = [
    u.is_suspended && { t: 'suspended', c: 'text-danger' },
    u.age_review_required && { t: 'age check', c: 'text-warn' },
    u.chat_ban_permanent && { t: 'chat ban: permanent', c: 'text-danger' },
    !u.chat_ban_permanent && u.chat_banned && u.chat_banned_until && { t: `chat ban until ${new Date(u.chat_banned_until).toLocaleString()}`, c: 'text-warn' },
  ].filter(Boolean) as { t: string; c: string }[];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-medium">{u.username}</span>
        <span className="font-mono text-xs text-faint">{u.email}</span>
        {u.role !== 'user' ? <span className="font-mono text-xs text-muted">{u.role}</span> : null}
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
        <div><dt className="inline text-faint">strikes </dt><dd className="inline text-fg">{u.strike_points}</dd></div>
        <div><dt className="inline text-faint">reports </dt><dd className="inline text-fg">{u.report_count}</dd></div>
        <div><dt className="inline text-faint">joined </dt><dd className="inline text-fg">{relativeTime(u.created_at)} ago</dd></div>
        <div><dd className={u.is_online ? 'text-ok' : 'text-faint'}>{u.is_online ? 'online' : 'offline'}</dd></div>
      </dl>
      {flags.length ? (
        <p className="flex flex-wrap gap-3 font-mono text-xs">{flags.map((f) => <span key={f.t} className={f.c}>{f.t}</span>)}</p>
      ) : null}
    </div>
  );
}

function EventList({ events, showUser }: { events: ModEvent[]; showUser?: boolean }) {
  if (!events.length) return <p className="text-[13px] text-faint">Nothing recorded.</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {events.map((e) => (
        <li key={e.id} className="grid gap-1 py-2.5 sm:grid-cols-[6.5rem_1fr]">
          <span className="font-mono text-2xs text-faint">{relativeTime(e.created_at)} ago</span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-[13px]">
              {showUser ? <span className="mr-2 font-mono text-muted">{e.username}</span> : null}
              <span className={clsx(e.severity === 'critical' || e.severity === 'high' ? 'text-danger' : 'text-fg')}>{e.action}</span>
              <span className="text-faint"> · {e.category} · {e.source}</span>
            </p>
            {e.detail ? <p className="text-xs text-muted">{e.detail}</p> : null}
            {e.excerpt ? <p className="truncate font-mono text-xs text-faint">“{e.excerpt}”</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Reports tab ──────────────────────────────────────────────────────────────

function ReportsTab({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed' | 'all'>('open');
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();

  const load = useCallback(() => {
    setRows(null);
    api<ReportRow[]>(`/admin/reports?status=${status}`).then(setRows).catch((e) => setError(errorMessage(e)));
  }, [status]);

  useEffect(load, [load]);

  useEffect(() => {
    setDetail(null);
    setNote('');
    if (selected) api<ReportDetail>(`/admin/reports/${selected}`).then(setDetail).catch((e) => setError(errorMessage(e)));
  }, [selected]);

  const resolve = async (action: string, label: string, danger?: boolean) => {
    if (!detail) return;
    if (danger) {
      const ok = await ask({
        title: `${label}?`,
        body: `This applies to ${detail.reported?.username ?? 'this user'} immediately.`,
        confirmLabel: label,
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(action);
    setError(null);
    try {
      const updated = await api<ReportDetail>(`/admin/reports/${detail.id}/resolve`, { method: 'POST', body: { action, note: note || null } });
      setDetail(updated);
      setRows((r) => (status === 'open' ? r?.filter((x) => x.id !== detail.id) ?? null : r));
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-0 flex-1 md:grid-cols-[22rem_1fr]">
      {dialog}
      <div className={clsx('min-h-0 flex-col border-r border-line md:flex', selected ? 'hidden' : 'flex')}>
        <div className="flex gap-1 border-b border-line px-3 py-2">
          {(['open', 'actioned', 'dismissed', 'all'] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={clsx('rounded px-2.5 py-1 font-mono text-xs', status === s ? 'bg-primary text-primary-fg' : 'text-faint hover:text-fg')}>
              {s}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="flex justify-center py-10 text-muted"><Spinner /></div>
          ) : rows.length ? (
            <ul>
              {rows.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setSelected(r.id)}
                    className={clsx('w-full border-b border-l-2 border-b-line px-4 py-3 text-left transition-colors',
                      selected === r.id ? 'border-l-ball bg-raised' : 'border-l-transparent hover:bg-surface')}>
                    <div className="mb-1 flex items-center gap-2">
                      <Priority p={r.priority} />
                      <span className="text-[13px]">{REASON_LABEL[r.reason] ?? r.reason}</span>
                      <span className="ml-auto font-mono text-2xs text-faint">{relativeTime(r.created_at)}</span>
                    </div>
                    <p className="truncate font-mono text-xs text-muted">
                      {r.reported?.username ?? 'deleted user'}
                      <span className="text-faint"> · {r.source === 'ai' ? 'AI monitor' : r.source === 'system' ? 'auto filter' : `by ${r.reporter?.username ?? '—'}`}</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4"><EmptyState title="Queue is clear">No {status === 'all' ? '' : status} reports.</EmptyState></div>
          )}
        </div>
      </div>

      <div className={clsx('min-h-0 overflow-y-auto', selected ? 'block' : 'hidden md:block')}>
        {!selected ? (
          <p className="p-8 font-mono text-xs text-faint">select a report</p>
        ) : !detail ? (
          <div className="flex justify-center py-10 text-muted"><Spinner /></div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-8 px-5 py-6 sm:px-8">
            <button onClick={() => setSelected(null)} className="font-mono text-xs text-faint hover:text-fg md:hidden">← all reports</button>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Priority p={detail.priority} />
                <h2 className="text-lg font-medium">{REASON_LABEL[detail.reason] ?? detail.reason}</h2>
                <span className="font-mono text-xs text-faint">
                  {detail.source === 'ai' ? 'flagged by AI monitor' : detail.source === 'system' ? 'flagged by filter' : `reported by ${detail.reporter?.username}`}
                  {' · '}{new Date(detail.created_at).toLocaleString()}
                </span>
              </div>
              {detail.details ? <p className="border-l-2 border-line-strong pl-3 text-sm text-muted">{detail.details}</p> : null}
              {detail.status !== 'open' ? (
                <Alert tone="info">Resolved: {detail.status}{detail.resolution_note ? ` — ${detail.resolution_note}` : ''}</Alert>
              ) : null}
            </div>

            {detail.reported ? (
              <div className="panel p-5">
                <UserFacts u={detail.reported} />
                {detail.other_reports ? <p className="mt-2 font-mono text-xs text-warn">{detail.other_reports} other report(s) about this user</p> : null}
              </div>
            ) : null}

            <section className="space-y-2">
              <h3 className="label">Transcript</h3>
              {detail.evidence.length ? (
                <div className="panel space-y-1.5 p-5">
                  {detail.evidence.map((line, i) => {
                    const isReported = line.author === 'reported';
                    const who = { reporter: 'Reporter', reported: 'Reported', a: 'A', b: 'B' }[line.author] ?? line.author;
                    return (
                      <div key={i} className="grid grid-cols-[5.5rem_1fr_auto] gap-x-3">
                        <span className={clsx('font-mono text-xs', isReported ? 'text-danger' : 'text-faint')}>{who}</span>
                        <p className={clsx('whitespace-pre-wrap break-words text-[13px] leading-5', line.blocked ? 'text-warn' : 'text-fg')}>
                          {line.text}
                          {line.blocked ? <span className="ml-2 font-mono text-2xs text-warn/80">[blocked]</span> : null}
                        </p>
                        <span className="font-mono text-2xs text-faint">{clockTime(line.at)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[13px] text-faint">No transcript attached.</p>
              )}
            </section>

            {detail.status === 'open' ? (
              <section className="space-y-3">
                <h3 className="label">Decision</h3>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
                  placeholder="Note (shown to the user for bans and warnings)" className="field h-auto resize-none py-2" />
                {error ? <Alert tone="danger">{error}</Alert> : null}
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.map((a) => (
                    <Button key={a.value} size="sm" variant={a.danger ? 'danger' : a.value === 'dismiss' ? 'ghost' : 'secondary'}
                      loading={busy === a.value} disabled={busy !== null} onClick={() => resolve(a.value, a.label, a.danger)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="label">History for this user</h3>
              <EventList events={detail.history} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Users tab ────────────────────────────────────────────────────────────────

function UsersTab({ onChanged }: { onChanged: () => void }) {
  const me = useSession((s) => s.me)!;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [user, setUser] = useState<(UserSummary & { events: ModEvent[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => api<UserSummary[]>(`/admin/users?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const open = (id: string) => api<UserSummary & { events: ModEvent[] }>(`/admin/users/${id}`).then(setUser).catch((e) => setError(errorMessage(e)));

  const act = async (action: string, label: string, extra: Record<string, string> = {}) => {
    if (!user) return;
    const ok = await ask({ title: `${label}?`, body: `Applies to ${user.username} immediately.`, confirmLabel: label, danger: action !== 'lift' && action !== 'clear_age_review' });
    if (!ok) return;
    setError(null);
    try {
      await api(`/admin/users/${user.id}/action`, { method: 'POST', body: { action, ...extra } });
      await open(user.id);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 overflow-y-auto px-5 py-6 sm:px-8">
      {dialog}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username or email" className="field" aria-label="Search users" />
      {results.length && !user ? (
        <ul className="divide-y divide-line border-y border-line">
          {results.map((u) => (
            <li key={u.id}>
              <button onClick={() => open(u.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-surface">
                <span className="text-sm">{u.username} <span className="font-mono text-xs text-faint">{u.email}</span></span>
                <span className="font-mono text-xs text-faint">{u.strike_points} strikes</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {user ? (
        <div className="space-y-6">
          <button onClick={() => setUser(null)} className="font-mono text-xs text-faint hover:text-fg">← results</button>
          <div className="panel p-5"><UserFacts u={user} /></div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => act('lift', 'Lift all bans')}>Lift bans</Button>
            {user.age_review_required ? <Button size="sm" onClick={() => act('clear_age_review', 'Confirm adult')}>Confirm 18+</Button> : null}
            <Button size="sm" onClick={() => act('ban_24h', 'Ban 24h')}>Ban 24h</Button>
            <Button size="sm" onClick={() => act('ban_7d', 'Ban 7 days')}>Ban 7d</Button>
            <Button size="sm" variant="danger" onClick={() => act('suspend', 'Suspend account')}>Suspend</Button>
            {me.role === 'admin' && user.role === 'user' ? (
              <Button size="sm" variant="ghost" onClick={() => act('set_role', 'Make moderator', { role: 'moderator' })}>Make moderator</Button>
            ) : null}
          </div>
          <section className="space-y-2">
            <h3 className="label">Moderation history</h3>
            <EventList events={user.events} />
          </section>
        </div>
      ) : null}
    </div>
  );
}

// ── Activity tab ─────────────────────────────────────────────────────────────

function ActivityTab() {
  const [events, setEvents] = useState<ModEvent[] | null>(null);
  useEffect(() => {
    api<ModEvent[]>('/admin/events').then(setEvents).catch(() => setEvents([]));
  }, []);
  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-5 py-6 sm:px-8">
      {events === null ? <Spinner /> : <EventList events={events} showUser />}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const [tab, setTab] = useState<'reports' | 'users' | 'activity'>('reports');
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    if (me.role === 'user') router.replace('/chat');
    else loadStats();
  }, [me.role, router, loadStats]);

  if (me.role === 'user') return null;

  const tiles: [string, number | undefined, string?][] = [
    ['open reports', stats?.open_reports],
    ['urgent', stats?.urgent_reports, stats?.urgent_reports ? 'text-danger' : undefined],
    ['age checks', stats?.age_reviews, stats?.age_reviews ? 'text-warn' : undefined],
    ['actions 24h', stats?.events_24h],
    ['online', stats?.online],
    ['live chats', stats?.active_chats],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-6 border-b border-line px-5 sm:px-8">
        <h1 className="pixel text-[13px]">Moderation</h1>
        <nav className="flex gap-1">
          {(['reports', 'users', 'activity'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('rounded px-2.5 py-1 text-[13px] capitalize', tab === t ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg')}>
              {t}
            </button>
          ))}
        </nav>
      </div>
      <dl className="hidden shrink-0 grid-cols-6 border-b border-line lg:grid">
        {tiles.map(([label, value, cls]) => (
          <div key={label} className="border-r border-line px-5 py-3 last:border-r-0">
            <dt className="label">{label}</dt>
            <dd className={clsx('mt-1 font-mono text-lg', cls ?? 'text-fg')}>{value ?? '–'}</dd>
          </div>
        ))}
      </dl>
      <p className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-b border-line px-5 py-2 font-mono text-xs text-faint lg:hidden">
        {tiles.map(([label, value, cls]) => (
          <span key={label}>{label} <span className={cls ?? 'text-fg'}>{value ?? '–'}</span></span>
        ))}
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'reports' ? <ReportsTab onChanged={loadStats} /> : tab === 'users' ? <UsersTab onChanged={loadStats} /> : <ActivityTab />}
      </div>
    </div>
  );
}
