'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ReportDialog } from '@/components/report-dialog';
import { Alert, Avatar, Button, Spinner, useConfirm } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { MAX_DM_MESSAGE } from '@/lib/config';
import { dayLabel, relativeTime } from '@/lib/format';
import { messages, setActiveConversation, useMessages } from '@/lib/messages';
import { useSession } from '@/lib/session';
import type { Conversation, DirectMessage } from '@/lib/types';
import { ChatMessage, ComposerBar, EDIT_WINDOW_MS, EmojiButton, insertAtCaret, type ReactionChip } from '@/components/chat-message';

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const listed = useMessages((s) => s.conversations.find((c) => c.id === id));
  const thread = useMessages((s) => s.threads[id]);
  const typing = useMessages((s) => s.typing[id]);

  const [conv, setConv] = useState<Conversation | null>(listed ?? null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<{ text: string; tone: 'warning' | 'ok' } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const { ask, dialog } = useConfirm();

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [editing, setEditing] = useState<DirectMessage | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (listed) setConv(listed);
  }, [listed]);

  useEffect(() => {
    setActiveConversation(id);
    stick.current = true;
    setError(null);
    if (!listed) {
      api<Conversation>(`/conversations/${id}`).then(setConv).catch((e) => setError(errorMessage(e)));
    }
    messages.loadThread(id).catch((e) => setError(errorMessage(e)));
    return () => setActiveConversation(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, typing]);

  const loadOlder = async () => {
    const el = scroller.current;
    if (!el || loadingOlder || !thread?.cursor) return;
    setLoadingOlder(true);
    const before = el.scrollHeight;
    await messages.loadOlder(id).catch(() => {});
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - before;
      setLoadingOlder(false);
    });
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !conv?.can_message) return;
    setDraft('');
    setNotice(null);
    if (editing) {
      const target = editing;
      setEditing(null);
      if (text !== target.content) {
        const err = await messages.edit(id, target.id, text.slice(0, MAX_DM_MESSAGE));
        if (err) setNotice({ text: `Edit not saved: ${err}`, tone: 'warning' });
      }
      return;
    }
    const quoting = replyTo;
    setReplyTo(null);
    stick.current = true;
    messages.typing(id, false);
    lastTyping.current = 0;
    const result = await messages.send(id, me.id, text.slice(0, MAX_DM_MESSAGE), quoting);
    if (result.support) setNotice({ text: result.support, tone: 'ok' });
    else if (result.notice) setNotice({ text: result.notice, tone: 'warning' });
  };

  const onDraft = (value: string) => {
    setDraft(value);
    const now = Date.now();
    if (now - lastTyping.current > 2500) {
      messages.typing(id, true);
      lastTyping.current = now;
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      messages.typing(id, false);
      lastTyping.current = 0;
    }, 3000);
  };

  const unfriend = async () => {
    if (!conv) return;
    const ok = await ask({
      title: `Remove ${conv.other_user.username}?`,
      body: 'You won’t be able to message each other unless you add each other again.',
      confirmLabel: 'Remove friend',
      danger: true,
    });
    if (!ok) return;
    await api(`/friends/${conv.other_user.id}`, { method: 'DELETE' }).catch(() => {});
    setConv({ ...conv, can_message: false });
    void messages.loadConversations();
  };

  const block = async () => {
    if (!conv) return;
    const ok = await ask({
      title: `Block ${conv.other_user.username}?`,
      body: 'They’ll be removed from your friends, can’t message you, and won’t be matched with you as a stranger.',
      confirmLabel: 'Block',
      danger: true,
    });
    if (!ok) return;
    await api(`/users/${conv.other_user.id}/block`, { method: 'POST' }).catch(() => {});
    setConv({ ...conv, can_message: false });
    void messages.loadConversations();
  };

  if (error && !conv) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-8">
        <Alert tone="danger">{error}</Alert>
        <Button size="sm" onClick={() => router.push('/messages')}>Back to messages</Button>
      </div>
    );
  }
  if (!conv) return <div className="flex flex-1 items-center justify-center text-muted"><Spinner /></div>;

  const other = conv.other_user;
  const list = thread?.messages ?? [];
  const lastMineIdx = list.map((m) => (m.deleted ? '' : m.sender_id)).lastIndexOf(me.id);
  const nameOf = (senderId: string | null) => (senderId === me.id ? 'You' : other.username);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <Link href="/messages" className="p-1.5 text-muted hover:text-fg md:hidden" aria-label="Back">
          <span className="text-sm font-bold">&larr;</span>
        </Link>
        <Avatar name={other.username} src={other.avatar_url} size={34} online={other.is_online} />
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold tracking-tight">{other.username}</p>
          <p className="text-xs text-faint">
            {typing ? 'typing…' : other.is_online ? 'online' : `last seen ${relativeTime(other.last_seen)}`}
          </p>
        </div>
        <div className="ml-auto flex items-center">
          <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)} title="Report" className="hover:text-danger">
            Report
          </Button>
          {conv.can_message ? (
            <Button size="sm" variant="ghost" onClick={unfriend} title="Remove friend">
              Unfriend
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={block} title="Block">
            Block
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 60) void loadOlder();
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {!thread?.loaded ? (
            <div className="flex justify-center py-10 text-muted"><Spinner /></div>
          ) : (
            <>
              {thread.cursor ? (
                <div className="flex justify-center pb-4">
                  <Button size="sm" variant="ghost" onClick={loadOlder} loading={loadingOlder}>Load earlier</Button>
                </div>
              ) : (
                <div className="flex justify-center pb-6">
                  <span className="text-xs uppercase tracking-[0.12em] text-faint">
                    — start of your rally with {other.username} —
                  </span>
                </div>
              )}
              {list.map((m, i) => {
                const prev = list[i - 1];
                const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
                const grouped = prev && !newDay && prev.sender_id === m.sender_id &&
                  Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000;
                const mine = m.sender_id === me.id;
                return (
                  <Fragment key={m.id}>
                    {newDay ? (
                      <div className="flex justify-center py-4">
                        <span className="font-mono text-[11px] text-faint">{dayLabel(m.created_at)}</span>
                      </div>
                    ) : null}
                    <div className={grouped ? '' : 'pt-2'}>
                      <ChatMessage
                        domId={`dm-${m.id}`}
                        mine={mine}
                        text={m.content}
                        at={m.created_at}
                        deleted={m.deleted}
                        edited={m.edited}
                        status={m.failed ? 'failed' : m.pending ? 'sending' : 'sent'}
                        reason={m.failed}
                        quote={m.reply_to ? {
                          author: nameOf(m.reply_to.sender_id),
                          text: m.reply_to.content,
                          deleted: m.reply_to.deleted,
                          targetId: `dm-${m.reply_to.id}`,
                        } : null}
                        reactions={chipsFor(m, me.id)}
                        myReaction={m.reactions?.find((r) => r.user_id === me.id)?.emoji ?? null}
                        receipt={i === lastMineIdx && !m.pending && !m.failed ? (m.is_read ? 'seen' : 'sent') : null}
                        canInteract={conv.can_message}
                        canEdit={mine && Date.now() - Date.parse(m.created_at) < EDIT_WINDOW_MS}
                        onReply={() => {
                          setEditing(null);
                          setReplyTo(m);
                          input.current?.focus();
                        }}
                        onReact={(e) => messages.react(id, m.id, me.id, e)}
                        onEdit={() => {
                          setReplyTo(null);
                          setEditing(m);
                          setDraft(m.content);
                          input.current?.focus();
                        }}
                        onUnsend={async () => {
                          const ok = await ask({
                            title: 'Unsend for everyone?',
                            body: 'It will be removed for both of you. Moderators can still see unsent messages if the chat is reported.',
                            confirmLabel: 'Unsend',
                            danger: true,
                          });
                          if (ok) void messages.unsend(id, m.id);
                        }}
                      />
                    </div>
                  </Fragment>
                );
              })}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pb-4 pt-1 sm:px-6">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          {conv.can_message && (replyTo || editing) ? (
            <ComposerBar
              mode={editing ? 'edit' : 'reply'}
              author={replyTo ? (replyTo.sender_id === me.id ? 'yourself' : other.username) : undefined}
              text={(editing?.content ?? replyTo?.content) || ''}
              onCancel={() => {
                if (editing) setDraft('');
                setEditing(null);
                setReplyTo(null);
              }}
            />
          ) : null}
          {conv.can_message ? (
            <div className="flex items-stretch gap-2">
              <div className="flex min-w-0 flex-1 items-stretch border-2 border-line-strong focus-within:border-fg">
              <EmojiButton onPick={(e) => setDraft((d) => insertAtCaret(input.current, d, e))} />
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  } else if (e.key === 'Escape' && (replyTo || editing)) {
                    if (editing) setDraft('');
                    setEditing(null);
                    setReplyTo(null);
                  }
                }}
                rows={1}
                maxLength={MAX_DM_MESSAGE}
                placeholder={`Message ${other.username}`}
                aria-label="Message"
                className="block max-h-40 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 leading-6 text-fg placeholder:text-faint focus:outline-none [field-sizing:content]"
              />
              </div>
              <Button variant="primary" className="h-auto min-h-12 shrink-0 px-5" onClick={send} disabled={!draft.trim()}>
                {editing ? 'Save' : 'Send'}
              </Button>
            </div>
          ) : (
            <p className="py-2 text-[13px] text-faint">You can’t message {other.username} — you’re no longer friends.</p>
          )}
        </div>
      </div>

      {dialog}
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        target={{ userId: other.id, conversationId: conv.id, username: other.username }}
        onDone={(blocked) => {
          if (blocked) {
            setConv({ ...conv, can_message: false });
            void messages.loadConversations();
          }
        }}
      />
    </div>
  );
}

function chipsFor(m: DirectMessage, myId: string): ReactionChip[] {
  const chips: ReactionChip[] = [];
  for (const r of m.reactions ?? []) {
    const chip = chips.find((c) => c.emoji === r.emoji);
    if (chip) {
      chip.count += 1;
      chip.mine ||= r.user_id === myId;
    } else {
      chips.push({ emoji: r.emoji, count: 1, mine: r.user_id === myId });
    }
  }
  return chips;
}
