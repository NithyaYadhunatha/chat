'use client';

import clsx from 'clsx';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PENDING_INTERESTS_KEY } from '@/components/landing';
import { ReportDialog } from '@/components/report-dialog';
import { Alert, Ball, Button, ButtonLink, InterestInput, Kbd } from '@/components/ui';
import { api } from '@/lib/api';
import { MAX_STRANGER_MESSAGE } from '@/lib/config';
import { banText, clockTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { stranger, useStranger, type Line, type Side } from '@/lib/stranger';
import { ChatMessage, ComposerBar, EDIT_WINDOW_MS, EmojiButton, insertAtCaret, type ReactionChip } from '@/components/chat-message';

const CONNECT_AFTER = 6;

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function useClock(running: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

const pad2 = (n: number) => String(Math.min(n, 99)).padStart(2, '0');

// ── Scoreboard: Pong-style digits over each half ─────────────────────────────

function Scoreboard({ actions }: { actions: React.ReactNode }) {
  const s = useStranger();
  const live = s.phase === 'chatting';
  const now = useClock(live);
  const playing = live || s.phase === 'ended';
  const elapsed = s.startedAt ? (s.endedAt ?? now) - s.startedAt : 0;
  const theirs = playing ? s.lines.filter((l) => l.kind === 'stranger').length : 0;
  const mine = playing ? s.lines.filter((l) => l.kind === 'you' && l.status === 'sent').length : 0;

  return (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b-2 border-line px-3 py-2.5 sm:px-6 sm:py-3">
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="pixel text-lg text-fg sm:text-[28px]">{pad2(theirs)}</span>
        <span className="label text-fg">{s.cpu ? 'CPU' : <span className="hidden sm:inline">Stranger</span>}</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="label hidden sm:block">{live ? (s.cpu ? 'vs cpu' : 'live') : s.phase === 'ended' ? 'game over' : 'ready'}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted sm:text-xs">
          rally {pad2(playing ? s.rally : 0)}<span className="hidden sm:inline"> · {playing ? mmss(elapsed) : '00:00'}</span>
        </span>
      </div>
      <div className="flex items-center justify-end gap-2 sm:gap-4">
        <span className="label hidden text-ball sm:inline">You</span>
        <span className="pixel text-lg text-ball sm:text-[28px]">{pad2(mine)}</span>
        <div className="hidden items-center lg:flex">{actions}</div>
      </div>
      {playing ? <div className="col-span-3 -mb-1 mt-1 flex justify-end lg:hidden">{actions}</div> : null}
    </div>
  );
}

// ── Playfield contents ───────────────────────────────────────────────────────

interface LineActions {
  byMid: Map<string, Line>;
  lastSentMid: string | null;
  live: boolean;
  onReply: (l: Line) => void;
  onEdit: (l: Line) => void;
  onUnsend: (l: Line) => void;
}

function TableLine({ line, cpu, act }: { line: Line; cpu: boolean; act: LineActions }) {
  if (line.kind === 'system') {
    return (
      <div className="flex justify-center py-2.5">
        <span className="bg-bg px-3 text-xs uppercase tracking-[0.12em] text-faint">— {line.text} —</span>
      </div>
    );
  }
  if (line.kind === 'notice') {
    const tone = {
      info: 'border-line-strong text-muted',
      warning: 'border-warn text-warn',
      danger: 'border-danger text-danger',
      support: 'border-ok text-fg',
    }[line.tone ?? 'info'];
    return (
      <div className="flex justify-center py-2">
        <p className={clsx('max-w-md border-2 bg-bg px-4 py-2.5 text-[13px] leading-5', tone)}>{line.text}</p>
      </div>
    );
  }
  if (line.kind === 'serve') {
    const who = line.by === 'you' ? 'you served' : line.by === 'stranger' ? `${cpu ? 'cpu' : 'stranger'} served` : 'serve';
    return (
      <div className="flex justify-center py-4">
        <div className="max-w-md border-2 border-line px-5 py-3 text-center">
          <p className="label mb-1.5 text-ball">{who}</p>
          <p className="text-[15px] leading-snug text-fg">{line.text}</p>
        </div>
      </div>
    );
  }

  const mine = line.kind === 'you';
  const them = cpu ? 'CPU' : 'Stranger';
  const quoted = line.replyTo ? act.byMid.get(line.replyTo) : undefined;
  const chips: ReactionChip[] = [];
  for (const [side, emoji] of Object.entries(line.reactions ?? {}) as [Side, string][]) {
    const chip = chips.find((c) => c.emoji === emoji);
    if (chip) chip.count += 1;
    else chips.push({ emoji, count: 1, mine: side === 'you' });
    if (chip && side === 'you') chip.mine = true;
  }
  const myReaction = line.reactions?.you ?? null;

  return (
    <ChatMessage
      domId={line.mid ? `m-${line.mid}` : undefined}
      mine={mine}
      text={line.text}
      at={line.at}
      deleted={line.deleted}
      edited={line.edited}
      status={line.status}
      reason={line.reason}
      quote={line.replyTo ? {
        author: quoted ? (quoted.kind === 'you' ? 'You' : them) : 'Message',
        text: quoted?.text ?? '',
        deleted: !quoted || quoted.deleted,
        targetId: `m-${line.replyTo}`,
      } : null}
      reactions={chips}
      myReaction={myReaction}
      receipt={mine && line.mid && line.mid === act.lastSentMid ? (line.seen ? 'seen' : 'sent') : null}
      canInteract={act.live && Boolean(line.mid)}
      canEdit={mine && act.live && Date.now() - line.at < EDIT_WINDOW_MS}
      onReply={() => act.onReply(line)}
      onReact={(e) => line.mid && stranger.react(line.mid, myReaction === e ? null : e)}
      onEdit={() => act.onEdit(line)}
      onUnsend={() => act.onUnsend(line)}
    />
  );
}

function TypingLine() {
  return (
    <div className="flex justify-start py-1.5">
      <p className="border-l-4 border-fg bg-bg py-1 pl-3 text-[15px] text-muted" aria-label="Typing">
        <span className="animate-blink">█</span>
      </p>
    </div>
  );
}

/** Attract mode: a tiny game of Pong plays while you wait. */
function AttractPong({ className }: { className?: string }) {
  return (
    <div className={clsx('relative border-2 border-fg', className)} aria-hidden>
      <span className="court-net absolute inset-y-2 left-1/2 -translate-x-1/2" />
      <span className="absolute left-[3%] h-9 w-2 bg-fg" style={{ animation: 'paddle 1.9s linear infinite alternate' }} />
      <span className="absolute right-[3%] h-9 w-2 bg-ball" style={{ animation: 'paddle 1.6s linear infinite alternate-reverse' }} />
      <span
        className="absolute h-2.5 w-2.5 bg-fg"
        style={{ animation: 'pong-x 1.3s linear infinite alternate, pong-y 0.9s linear infinite alternate' }}
      />
    </div>
  );
}

function Searching({ interests, onStop }: { interests: string[]; onStop: () => void }) {
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 py-12 text-center">
      <AttractPong className="h-36 w-full max-w-sm" />
      <div className="space-y-3">
        <p className="pixel animate-blink text-sm">waiting for player 2</p>
        <p className="text-sm text-muted">
          {interests.length ? <>looking for someone into <span className="text-fg">{interests.join(', ')}</span></> : 'anyone, anywhere — adults only'}
        </p>
        {waited >= 6 ? (
          <p className="text-xs text-faint">quiet right now. the cpu will step in shortly, or you can play it now.</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => stranger.playCpu()}>Play the CPU</Button>
        <Button size="sm" variant="secondary" onClick={onStop}>Stop</Button>
      </div>
    </div>
  );
}

function StartPanel({ interests, setInterests, onStart }: { interests: string[]; setInterests: (v: string[]) => void; onStart: () => void }) {
  return (
    <div className="flex min-h-full items-center justify-center py-10">
      <div className="w-full max-w-md border-2 border-fg bg-bg p-6 sm:p-8">
        <p className="pixel mb-6 text-base leading-relaxed">player 1<br />ready?</p>
        <p className="mb-6 text-sm leading-6 text-muted">
          You’ll be paired with a random adult. Add interests to find someone into the same things, or leave it empty to play anyone.
        </p>
        <div className="mb-6 space-y-2">
          <span className="label">interests</span>
          <InterestInput value={interests} onChange={setInterests} placeholder="music, films, chess…" />
        </div>
        <div className="flex items-center gap-4">
          <Button variant="primary" size="lg" onClick={onStart}>Start match</Button>
          <span className="hidden items-center gap-2 text-xs text-faint sm:flex"><Kbd>Esc</Kbd> also works</span>
        </div>
      </div>
    </div>
  );
}

function MatchOver({ onNew, onReport, onDownload, canReport }: { onNew: () => void; onReport: () => void; onDownload: () => void; canReport: boolean }) {
  const s = useStranger();
  const duration = s.startedAt && s.endedAt ? s.endedAt - s.startedAt : 0;
  const canRate = s.exchanged >= 2 && s.lastSessionId;

  return (
    <div className="flex justify-center py-8">
      <div className="w-full max-w-sm border-2 border-fg bg-bg p-6 text-center">
        <p className="pixel mb-6 text-lg">game over</p>
        <dl className="mb-6 grid grid-cols-3 border-2 border-line">
          {[
            ['rally', pad2(s.rally)],
            ['time', mmss(duration)],
            ['shots', pad2(s.exchanged)],
          ].map(([k, v], i) => (
            <div key={k} className={clsx('px-2 py-3', i > 0 && 'border-l-2 border-line')}>
              <dd className="pixel text-sm">{v}</dd>
              <dt className="label mt-2">{k}</dt>
            </div>
          ))}
        </dl>

        {canRate ? (
          s.rated ? (
            <p className="mb-6 text-xs text-muted">noted. ratings are private.</p>
          ) : (
            <div className="mb-6">
              <p className="label mb-3 text-muted">good rally?</p>
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => stranger.rate(1)} aria-label="Good chat">Yes</Button>
                <Button size="sm" variant="secondary" onClick={() => stranger.rate(-1)} aria-label="Bad chat">No</Button>
              </div>
            </div>
          )
        ) : null}

        <Button variant="primary" onClick={onNew} className="w-full">Insert coin · new match</Button>
        <div className="mt-3 flex justify-center gap-1">
          <Button size="sm" variant="ghost" onClick={onDownload}>Save log</Button>
          {canReport ? <Button size="sm" variant="ghost" onClick={onReport} className="hover:text-danger">Report</Button> : null}
        </div>
      </div>
    </div>
  );
}

function BannedPanel() {
  const { me } = useSession();
  const ban = useStranger((s) => s.ban);
  const until = ban?.until ?? me?.chat_ban.until ?? null;
  const permanent = ban?.permanent ?? me?.chat_ban.permanent ?? false;
  const reason = ban?.reason ?? me?.chat_ban.reason;
  const ageReview = me?.chat_ban.age_review || reason?.toLowerCase().includes('age check');

  return (
    <div className="flex min-h-full items-center justify-center py-10">
      <div className="w-full max-w-md border-2 border-danger bg-bg p-7">
        <p className="pixel mb-5 text-base text-danger">benched</p>
        {ageReview ? (
          <p className="text-sm leading-6 text-muted">
            PingPong is for adults only. Your account was flagged as possibly under 18, so stranger chat is paused until a
            moderator reviews it. If that’s a mistake, the review will clear it.
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted">
            You can’t play strangers right now.{' '}
            {reason ? <>Reason: <span className="text-fg">{reason}</span>. </> : null}
            This lasts {banText(until, permanent)}.
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <ButtonLink href="/rules" size="sm">House rules</ButtonLink>
          <ButtonLink href="/messages" size="sm" variant="ghost">Messages</ButtonLink>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function downloadLog(lines: Line[], startedAt: number | null, cpu: boolean) {
  const when = new Date(startedAt ?? Date.now());
  const them = cpu ? 'CPU' : 'Stranger';
  const body = lines
    .map((l) => {
      const t = clockTime(l.at);
      if (l.kind === 'you') return `[${t}] You: ${l.text}${l.status === 'rejected' ? '  (not delivered)' : ''}`;
      if (l.kind === 'stranger') return `[${t}] ${them}: ${l.text}`;
      if (l.kind === 'serve') return `[${t}] -- Serve: ${l.text}`;
      return `[${t}] -- ${l.text}`;
    })
    .join('\n');
  const blob = new Blob([`PingPong match · ${when.toLocaleString()}\n\n${body}\n`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pingpong-${when.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function ChatScreen() {
  const params = useSearchParams();
  const me = useSession((s) => s.me)!;
  const reloadMe = useSession((s) => s.reloadMe);
  const s = useStranger();

  const [interests, setInterests] = useState<string[]>(me.interests);
  const [draft, setDraft] = useState('');
  const [armed, setArmed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<Line | null>(null);
  const [editing, setEditing] = useState<Line | null>(null);
  const lastSeenSent = useRef<string | null>(null);
  const reportedFromLiveChat = useRef(false);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastTypingSent = useRef(0);
  const armTimer = useRef<ReturnType<typeof setTimeout>>();

  const banned = s.phase === 'banned' || (me.chat_ban.banned && s.phase === 'idle');
  const chatting = s.phase === 'chatting';
  const reportableSession = s.sessionId ?? s.lastSessionId;
  const canReport = Boolean(reportableSession && !reported.has(reportableSession));

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(PENDING_INTERESTS_KEY);
      if (pending) {
        sessionStorage.removeItem(PENDING_INTERESTS_KEY);
        const parsed = JSON.parse(pending);
        if (Array.isArray(parsed) && parsed.length) setInterests(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(() => {
    if (banned) return;
    if (interests.join('|') !== me.interests.join('|')) {
      void api('/users/me', { method: 'PATCH', body: { interests } }).then(() => reloadMe()).catch(() => {});
    }
    stranger.start(interests);
  }, [banned, interests, me.interests, reloadMe]);

  const next = useCallback(() => {
    setArmed(false);
    stranger.next(interests);
  }, [interests]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (params.get('start') && !autoStarted.current && s.phase === 'idle' && !banned) {
      autoStarted.current = true;
      // Drop ?start=1 without a navigation (router.replace would remount and cancel the search).
      window.history.replaceState(null, '', '/chat');
      start();
    }
  }, [params, s.phase, banned, start]);

  useEffect(() => {
    if (s.phase === 'banned') void reloadMe();
  }, [s.phase, reloadMe]);

  useEffect(() => {
    setReplyTo(null);
    setEditing(null);
  }, [s.sessionId]);

  // Read receipts: tell the other side when their latest message has been seen.
  const lastTheirs = [...s.lines].reverse().find((l) => l.kind === 'stranger' && l.mid);
  useEffect(() => {
    const mid = lastTheirs?.mid;
    if (!mid || !chatting || s.cpu || lastSeenSent.current === mid) return;
    const mark = () => {
      if (document.visibilityState === 'visible' && lastSeenSent.current !== mid) {
        lastSeenSent.current = mid;
        stranger.markSeen(mid);
      }
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [lastTheirs?.mid, chatting, s.cpu]);

  useEffect(() => {
    if (chatting) input.current?.focus();
  }, [chatting, s.sessionId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [s.lines.length, s.partnerTyping, s.phase]);

  // Esc: start / skip (press twice while playing, like the original).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      if (banned) return;
      if (replyTo || editing) {
        setReplyTo(null);
        if (editing) setDraft('');
        setEditing(null);
        return;
      }
      if (s.phase === 'idle' || s.phase === 'ended') return start();
      if (s.phase === 'searching') return stranger.stop();
      if (armed) return next();
      setArmed(true);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 2500);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.phase, armed, banned, start, next, replyTo, editing]);

  // Leaving the chat page while searching leaves the queue. Deferred so React's
  // dev-mode double mount (StrictMode) doesn't cancel a search that just started.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current && useStranger.getState().phase === 'searching') stranger.stop();
      }, 0);
    };
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text || !chatting) return;
    if (editing?.mid) {
      if (text !== editing.text) stranger.edit(editing.mid, text.slice(0, MAX_STRANGER_MESSAGE));
      setEditing(null);
      setDraft('');
      return;
    }
    stranger.send(text.slice(0, MAX_STRANGER_MESSAGE), replyTo?.mid);
    setReplyTo(null);
    setDraft('');
    clearTimeout(typingTimer.current);
    lastTypingSent.current = 0;
    stick.current = true;
  };

  const onDraft = (value: string) => {
    setDraft(value);
    if (!chatting) return;
    const now = Date.now();
    if (now - lastTypingSent.current > 2500) {
      stranger.typing(true);
      lastTypingSent.current = now;
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      stranger.typing(false);
      lastTypingSent.current = 0;
    }, 3000);
  };

  const openReport = () => {
    reportedFromLiveChat.current = chatting;
    setReportOpen(true);
  };

  const byMid = new Map(s.lines.filter((l) => l.mid).map((l) => [l.mid as string, l]));
  const lastSentMid = [...s.lines].reverse().find((l) => l.kind === 'you' && l.status === 'sent' && !l.deleted)?.mid ?? null;
  const lineActions: LineActions = {
    byMid,
    lastSentMid,
    live: chatting,
    onReply: (l) => {
      setEditing(null);
      setReplyTo(l);
      input.current?.focus();
    },
    onEdit: (l) => {
      setReplyTo(null);
      setEditing(l);
      setDraft(l.text);
      input.current?.focus();
    },
    onUnsend: (l) => l.mid && stranger.unsend(l.mid),
  };

  const canConnect = chatting && !s.cpu && s.exchanged >= CONNECT_AFTER;
  const actions = (
    <>
      {s.connect === 'connected' && s.conversationId ? (
        <ButtonLink href={`/messages/${s.conversationId}`} size="sm" variant="ghost">
          Message
        </ButtonLink>
      ) : chatting && !s.cpu ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!canConnect || s.connect === 'pending'}
          onClick={() => stranger.connect()}
          title={canConnect ? 'Both of you have to press this to see each other’s usernames' : 'Keep the rally going a bit longer first'}
          className={clsx(s.connect === 'requested' && 'text-ball')}
        >
          {s.connect === 'pending' ? 'Requested' : s.connect === 'requested' ? 'Add back' : 'Add'}
        </Button>
      ) : null}
      {chatting ? (
        <Button size="sm" variant="ghost" onClick={() => stranger.stop()} title="End this match without starting a new one">
          End
        </Button>
      ) : null}
      {canReport && (chatting || s.phase === 'ended') ? (
        <Button size="sm" variant="ghost" onClick={openReport} className="hover:text-danger" title="Report">
          Report
        </Button>
      ) : null}
      {chatting && !s.cpu ? (
        <Button
          size="sm"
          variant="ghost"
          title="Block — you won’t be matched again"
          onClick={() => {
            if (s.sessionId) void api('/stranger/block', { method: 'POST', body: { session_id: s.sessionId } });
          }}
        >
          Block
        </Button>
      ) : null}
    </>
  );

  const showTranscript = !banned && s.blocker === null && !(s.phase === 'idle' && s.lines.length === 0) && s.phase !== 'searching';

  return (
    <div className="flex h-full flex-col">
      <Scoreboard actions={actions} />

      <div className="min-h-0 flex-1">
        <div className="relative h-full overflow-hidden">

          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="relative h-full overflow-y-auto px-4 py-6 sm:px-8"
            aria-live="polite"
          >
            {banned ? (
              <BannedPanel />
            ) : s.blocker === 'onboarding_required' ? (
              <div className="flex min-h-full items-center justify-center">
                <div className="max-w-md space-y-4 border-2 border-fg bg-bg p-7">
                  <Alert tone="warning">Confirm your age and accept the house rules before you play strangers.</Alert>
                  <ButtonLink href="/onboarding?next=/chat" variant="primary">Continue</ButtonLink>
                </div>
              </div>
            ) : s.blocker === 'underage' ? (
              <div className="flex min-h-full items-center justify-center">
                <Alert tone="danger">Stranger chat is only for adults 18 and over.</Alert>
              </div>
            ) : s.phase === 'searching' ? (
              <Searching interests={interests} onStop={() => stranger.stop()} />
            ) : s.phase === 'idle' && s.lines.length === 0 ? (
              <StartPanel interests={interests} setInterests={setInterests} onStart={start} />
            ) : null}

            {showTranscript ? (
              <div className="mx-auto max-w-3xl">
                {s.cpu ? (
                  <p className="pb-3 text-center text-xs text-ball">
                    You’re playing the CPU, an AI practice bot. Skip any time to look for a human.
                  </p>
                ) : null}
                {s.lines.map((line) => <TableLine key={line.id} line={line} cpu={s.cpu} act={lineActions} />)}
                {s.partnerTyping && chatting ? <TypingLine /> : null}
                {s.phase === 'ended' ? (
                  <MatchOver
                    onNew={start}
                    onReport={openReport}
                    onDownload={() => downloadLog(s.lines, s.startedAt, s.cpu)}
                    canReport={canReport}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showTranscript ? (
        <div className="shrink-0 px-2 pb-2 sm:px-4 sm:pb-4">
          {chatting && (replyTo || editing) ? (
            <div className="mx-auto w-full max-w-4xl">
              <ComposerBar
                mode={editing ? 'edit' : 'reply'}
                author={replyTo?.kind === 'you' ? 'yourself' : s.cpu ? 'the CPU' : 'Stranger'}
                text={(editing ?? replyTo)?.text ?? ''}
                onCancel={() => {
                  if (editing) setDraft('');
                  setEditing(null);
                  setReplyTo(null);
                }}
              />
            </div>
          ) : null}
          <div className="mx-auto flex w-full max-w-4xl items-stretch gap-2">
            <Button
              variant={armed ? 'danger' : 'secondary'}
              className="h-auto min-h-12 w-[4.5rem] shrink-0 sm:w-[5.5rem]"
              onClick={() => {
                if (!chatting) return start();
                if (armed) return next();
                setArmed(true);
                clearTimeout(armTimer.current);
                armTimer.current = setTimeout(() => setArmed(false), 2500);
              }}
            >
              {chatting ? (armed ? 'Sure?' : 'Skip') : 'New'}
            </Button>
            <div className="relative flex min-w-0 flex-1 items-stretch border-2 border-line-strong focus-within:border-fg">
              <span aria-hidden className="select-none self-start py-3 pl-3 font-bold text-ball">&gt;</span>
              <EmojiButton disabled={!chatting} onPick={(e) => setDraft((d) => insertAtCaret(input.current, d, e))} />
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={!chatting}
                rows={1}
                maxLength={MAX_STRANGER_MESSAGE}
                placeholder={chatting ? 'your shot' : 'start a new match to type'}
                aria-label="Message"
                className="block max-h-40 min-h-12 flex-1 resize-none bg-transparent px-2 py-3 leading-6 text-fg placeholder:text-faint focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 [field-sizing:content]"
              />
              <button
                type="button"
                onClick={() => stranger.serve()}
                disabled={!chatting}
                title="Serve a conversation starter"
                className="self-center px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-faint hover:text-ball disabled:opacity-40 disabled:hover:text-faint"
              >
                Serve
              </button>
              {draft.length > MAX_STRANGER_MESSAGE - 150 ? (
                <span className="pointer-events-none absolute -top-5 right-1 text-[10px] text-faint">
                  {draft.length}/{MAX_STRANGER_MESSAGE}
                </span>
              ) : null}
            </div>
            <Button variant="primary" className="h-auto min-h-12 shrink-0 px-3 sm:px-5" onClick={send} disabled={!chatting || !draft.trim()}>
              {editing ? 'Save' : 'Send'}
            </Button>
          </div>
        </div>
      ) : null}

      {reportableSession ? (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          target={{ sessionId: reportableSession }}
          onDone={(blocked) => {
            setReported((r) => new Set(r).add(reportableSession));
            if (!reportedFromLiveChat.current) stranger.markReported(blocked ? 'blocked' : 'reported');
          }}
        />
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatScreen />
    </Suspense>
  );
}
