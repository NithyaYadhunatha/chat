'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Avatar, Ball, Button, Spinner, Wordmark } from '@/components/ui';
import { messages, useMessages, wireMessageEvents } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { socket, useSocketStatus } from '@/lib/socket';
import { useStranger, wireStrangerEvents } from '@/lib/stranger';

// Text-only navigation. Settings lives under your name at the bottom.
const NAV = [
  { href: '/chat', label: 'Play' },
  { href: '/messages', label: 'Chats' },
];

function useChatsBadge() {
  const unread = useMessages((s) => s.conversations.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0));
  const requests = useMessages((s) => s.requestsBadge);
  return unread + requests;
}

function NavLinks({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();
  const me = useSession((s) => s.me);
  const chatsBadge = useChatsBadge();
  const items = [
    ...NAV,
    ...(me && me.role !== 'user' ? [{ href: '/admin', label: mobile ? 'Mod' : 'Moderation' }] : []),
    ...(mobile ? [{ href: '/settings', label: 'Me' }] : []),
  ];

  return (
    <>
      {items.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const badge = href === '/messages' ? chatsBadge : 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors',
              mobile ? 'flex-1 justify-center py-4' : 'h-10 px-3',
              active ? (mobile ? 'text-ball' : 'bg-fg text-bg') : 'text-muted hover:text-fg',
            )}
          >
            {label}
            {badge > 0 ? (
              <span className={clsx('px-1.5 py-0.5 text-[10px] leading-none', active && !mobile ? 'bg-bg text-fg' : 'bg-ball text-ball-ink')}>
                {badge > 9 ? '9+' : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

function ConnectionNote() {
  const status = useSocketStatus((s) => s.status);
  if (status === 'replaced') {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-2 text-[13px] text-muted">
        <span>This account is open in another tab.</span>
        <Button size="sm" onClick={() => socket.start()}>Use here</Button>
      </div>
    );
  }
  if (status === 'reconnecting') {
    return (
      <div className="flex items-center gap-2 border-b border-line bg-surface px-5 py-2 text-xs text-warn">
        <Spinner className="h-3 w-3" /> reconnecting…
      </div>
    );
  }
  return null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, me, bootstrap, signOut } = useSession();
  const socketStatus = useSocketStatus((s) => s.status);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    wireStrangerEvents(() => {
      socket.stop();
      useStranger.setState({ phase: 'idle' });
      void signOut().then(() => router.replace('/login?suspended=1'));
    });
    wireMessageEvents();
    socket.start();
    void messages.loadConversations().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (me?.needs_onboarding && pathname !== '/onboarding') {
      router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
    }
  }, [me?.needs_onboarding, pathname, router]);

  if (status !== 'authenticated' || !me) {
    return (
      <div className="flex h-full items-center justify-center">
        <Ball size={14} bouncing />
      </div>
    );
  }

  if (pathname === '/onboarding') return <>{children}</>;

  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r-2 border-line md:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/chat"><Wordmark /></Link>
        </div>
        <nav className="flex flex-col gap-1 px-3 pt-3">
          <NavLinks />
        </nav>
        <Link
          href="/settings"
          title="Settings"
          className={clsx(
            'mt-auto flex items-center gap-3 border-t-2 border-line px-4 py-3 transition-colors',
            pathname === '/settings' ? 'bg-fg text-bg' : 'hover:bg-raised',
          )}
        >
          <Avatar name={me.username} src={me.avatar_url} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{me.username}</p>
            <p className={clsx('flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em]', pathname === '/settings' ? 'text-bg/60' : 'text-faint')}>
              <span className={clsx('h-1.5 w-1.5', socketStatus === 'open' ? 'bg-ok' : 'bg-warn')} />
              {socketStatus === 'open' ? 'online · settings' : socketStatus === 'replaced' ? 'paused' : 'connecting'}
            </p>
          </div>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionNote />
        <main className="min-h-0 flex-1 pb-14 md:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-line bg-bg md:hidden">
        <NavLinks mobile />
      </nav>
    </div>
  );
}
