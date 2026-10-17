'use client';

/**
 * "Chats": friends and DMs in one place.
 * Left column — friend requests, add-by-username, conversations, friends you
 * haven't messaged yet. Right column — the open conversation.
 */
import clsx from 'clsx';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Avatar, Button, ButtonLink, EmptyState, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { messages, useMessages } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { socket } from '@/lib/socket';
import type { Conversation, Friend, FriendRequest, PublicUser } from '@/lib/types';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="label px-5 pb-2 pt-5">{children}</p>;
}

function AddFriend({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) return setResults(null);
    const t = setTimeout(() => {
      api<PublicUser[]>(`/users/search?q=${encodeURIComponent(query)}`).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const add = async (u: PublicUser) => {
    try {
      await api(`/friends/request/${u.id}`, { method: 'POST' });
      setNote(`Request sent to ${u.username}.`);
      onDone();
    } catch (e) {
      setNote(errorMessage(e));
    }
  };

  return (
    <div className="border-b-2 border-line px-5 py-4">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
        placeholder="exact username"
        aria-label="Find by username"
        className="field h-10"
      />
      {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
      {results ? (
        results.length ? (
          <ul className="mt-2">
            {results.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="truncate">{u.username}</span>
                <Button size="sm" variant="ghost" onClick={() => add(u)}>Add</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-faint">No one by that name.</p>
        )
      ) : null}
    </div>
  );
}

function ChatsColumn({ activeId }: { activeId?: string }) {
  const router = useRouter();
  const { conversations, loaded, typing } = useMessages();
  const me = useSession((s) => s.me)!;
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [adding, setAdding] = useState(false);

  const loadPeople = useCallback(async () => {
    const [r, f] = await Promise.all([api<FriendRequest[]>('/friends/requests'), api<Friend[]>('/friends')]);
    setRequests(r);
    setFriends(f);
  }, []);

  useEffect(() => {
    messages.clearRequestsBadge();
    void loadPeople().catch(() => {});
    const offs = [
      socket.on('friend.request', () => void loadPeople()),
      socket.on('friend.accepted', () => void loadPeople()),
    ];
    return () => offs.forEach((off) => off());
  }, [loadPeople]);

  const answer = async (r: FriendRequest, accept: boolean) => {
    await api(`/friends/${accept ? 'accept' : 'decline'}/${r.id}`, { method: 'POST' }).catch(() => {});
    await loadPeople().catch(() => {});
    if (accept) void messages.loadConversations();
  };

  const openChat = async (f: Friend) => {
    const conv = await api<Conversation>('/conversations', { method: 'POST', body: { user_id: f.id } });
    messages.upsertConversation(conv);
    router.push(`/messages/${conv.id}`);
  };

  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');
  const withChat = new Set(conversations.map((c) => c.other_user.id));
  const quietFriends = friends.filter((f) => !withChat.has(f.id));

  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b-2 border-line px-5">
        <h1 className="pixel text-[13px]">Chats</h1>
        <Button size="sm" variant={adding ? 'secondary' : 'ghost'} onClick={() => setAdding((v) => !v)}>
          {adding ? 'Close' : 'Add friend'}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding ? <AddFriend onDone={() => void loadPeople()} /> : null}

        {incoming.length ? (
          <>
            <SectionLabel>Requests · {incoming.length}</SectionLabel>
            <ul>
              {incoming.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{r.user.username}</span>
                  <Button size="sm" variant="primary" onClick={() => answer(r, true)}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => answer(r, false)}>No</Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {!loaded ? (
          <div className="flex justify-center py-10 text-muted"><Spinner /></div>
        ) : conversations.length ? (
          <>
            {incoming.length ? <SectionLabel>Chats</SectionLabel> : null}
            <ul>
              {conversations.map((c) => {
                const preview = typing[c.id]
                  ? 'typing…'
                  : c.last_message
                    ? `${c.last_message.sender_id === me.id ? 'You: ' : ''}${c.last_message.content}`
                    : 'Say hello';
                return (
                  <li key={c.id}>
                    <Link
                      href={`/messages/${c.id}`}
                      className={clsx(
                        'flex items-center gap-3 border-l-4 px-4 py-3 transition-colors',
                        c.id === activeId ? 'border-ball bg-raised' : 'border-transparent hover:bg-surface',
                      )}
                    >
                      <Avatar name={c.other_user.username} src={c.other_user.avatar_url} size={34} online={c.other_user.is_online} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={clsx('truncate text-sm', c.unread_count ? 'font-bold' : '')}>{c.other_user.username}</p>
                          {c.last_message ? <span className="shrink-0 text-[11px] text-faint">{relativeTime(c.last_message.created_at)}</span> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className={clsx('truncate text-[13px]', c.unread_count ? 'text-fg' : 'text-faint')}>{preview}</p>
                          {c.unread_count ? <span className="ml-auto h-2 w-2 shrink-0 bg-ball" aria-label="Unread" /> : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : !incoming.length && !quietFriends.length ? (
          <div className="px-5">
            <EmptyState title="No chats yet" action={<ButtonLink href="/chat" size="sm">Play a stranger</ButtonLink>}>
              When you and a stranger both press Add, they show up here. You can also add someone by username.
            </EmptyState>
          </div>
        ) : null}

        {quietFriends.length ? (
          <>
            <SectionLabel>Friends</SectionLabel>
            <ul>
              {quietFriends.map((f) => (
                <li key={f.id}>
                  <button onClick={() => openChat(f)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface">
                    <Avatar name={f.username} src={f.avatar_url} size={28} online={f.is_online} />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.username}</span>
                    <span className="text-[11px] uppercase tracking-[0.1em] text-faint">message</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {outgoing.length ? (
          <>
            <SectionLabel>Sent requests</SectionLabel>
            <ul className="pb-4">
              {outgoing.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{r.user.username}</span>
                  <Button size="sm" variant="ghost" onClick={() => answer(r, false)}>Cancel</Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;

  return (
    <div className="flex h-full">
      <section className={clsx('w-full shrink-0 flex-col border-r-2 border-line md:flex md:w-80', activeId ? 'hidden' : 'flex')}>
        <ChatsColumn activeId={activeId} />
      </section>
      <section className={clsx('min-w-0 flex-1', activeId ? 'flex' : 'hidden md:flex')}>{children}</section>
    </div>
  );
}
