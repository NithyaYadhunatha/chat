'use client';

import { create } from 'zustand';
import { socket } from './socket';

export type Phase = 'idle' | 'searching' | 'chatting' | 'ended' | 'banned';
export type ConnectState = 'none' | 'pending' | 'requested' | 'connected';

export interface Line {
  id: string;
  kind: 'you' | 'stranger' | 'system' | 'notice' | 'serve';
  text: string;
  at: number;
  status?: 'sending' | 'sent' | 'rejected';
  reason?: string; // why a message of yours wasn't delivered
  tone?: 'info' | 'warning' | 'danger' | 'support';
  by?: 'you' | 'stranger' | 'table'; // who served a conversation starter
  // Chat features (WhatsApp/iMessage style)
  mid?: string;                       // server message id (set on ack for your own messages)
  replyTo?: string | null;            // mid of the message this replies to
  reactions?: Partial<Record<Side, string>>;
  edited?: boolean;
  deleted?: boolean;
  seen?: boolean;
}

export type Side = 'you' | 'stranger';

export interface Ban {
  until: string | null;
  permanent: boolean;
  reason: string | null;
}

interface StrangerState {
  phase: Phase;
  sessionId: string | null;
  lastSessionId: string | null;
  commonInterests: string[];
  lines: Line[];
  partnerTyping: boolean;
  exchanged: number;
  connect: ConnectState;
  friend: { id: string; username: string } | null;
  conversationId: string | null;
  ban: Ban | null;
  blocker: 'onboarding_required' | 'underage' | null;
  // Match stats: a "rally" counts every time the ball changes sides.
  rally: number;
  lastSide: Side | null;
  startedAt: number | null;
  endedAt: number | null;
  endReason: string | null;
  /** Bumped on each delivered message so the UI can animate the ball across the net. */
  shot: { n: number; from: Side } | null;
  rated: 1 | -1 | null;
  /** Player 2 is the CPU — a clearly-labelled practice bot. */
  cpu: boolean;
}

const initial: StrangerState = {
  phase: 'idle',
  sessionId: null,
  lastSessionId: null,
  commonInterests: [],
  lines: [],
  partnerTyping: false,
  exchanged: 0,
  connect: 'none',
  friend: null,
  conversationId: null,
  ban: null,
  blocker: null,
  rally: 0,
  lastSide: null,
  startedAt: null,
  endedAt: null,
  endReason: null,
  shot: null,
  rated: null,
  cpu: false,
};

export const useStranger = create<StrangerState>(() => initial);

const ENDED_TEXT: Record<string, string> = {
  skipped: 'You skipped this chat.',
  left: 'You left the chat.',
  partner_left: 'Stranger has left.',
  disconnected: 'Stranger disconnected.',
  moderation: 'This chat was ended by moderation.',
  safety: 'This chat was ended for safety reasons.',
  reported: 'You reported this chat. A moderator will review it.',
  blocked: "You blocked this stranger. You won't be matched again.",
};

let seq = 0;
const id = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

function push(line: Omit<Line, 'id' | 'at'> & { at?: number }) {
  useStranger.setState((s) => ({ lines: [...s.lines, { id: id(), at: Date.now(), ...line }] }));
}

/** A delivered message: count the rally and fire the ball animation. */
function hit(from: Side) {
  useStranger.setState((s) => ({
    exchanged: s.exchanged + 1,
    rally: s.lastSide && s.lastSide !== from ? s.rally + 1 : s.rally,
    lastSide: from,
    shot: { n: (s.shot?.n ?? 0) + 1, from },
  }));
}

// ── Actions ──────────────────────────────────────────────────────────────────

export const stranger = {
  start(interests: string[]) {
    useStranger.setState({ ...initial, phase: 'searching', ban: useStranger.getState().ban });
    socket.send({ type: 'stranger.join', interests });
  },

  next(interests: string[]) {
    const { sessionId, lastSessionId } = useStranger.getState();
    useStranger.setState({ ...initial, phase: 'searching', lastSessionId: sessionId ?? lastSessionId });
    socket.send({ type: 'stranger.next', interests });
  },

  stop() {
    const { phase } = useStranger.getState();
    socket.send({ type: 'stranger.leave' });
    if (phase === 'searching') useStranger.setState({ phase: 'idle', lines: [] });
  },

  send(text: string, replyTo?: string | null) {
    const clientId = id();
    useStranger.setState((s) => ({
      lines: [...s.lines, { id: clientId, kind: 'you', text, at: Date.now(), status: 'sending', replyTo: replyTo ?? null }],
    }));
    socket.send({ type: 'stranger.message', text, client_id: clientId, reply_to: replyTo ?? undefined });
  },

  react(mid: string, emoji: string | null) {
    socket.send({ type: 'stranger.react', message_id: mid, emoji });
  },

  edit(mid: string, text: string) {
    socket.send({ type: 'stranger.edit', message_id: mid, text });
  },

  unsend(mid: string) {
    socket.send({ type: 'stranger.unsend', message_id: mid });
  },

  markSeen(mid: string) {
    socket.send({ type: 'stranger.seen', message_id: mid });
  },

  typing(isTyping: boolean) {
    socket.send({ type: 'stranger.typing', typing: isTyping });
  },

  connect() {
    socket.send({ type: 'stranger.connect' });
  },

  serve() {
    socket.send({ type: 'stranger.serve' });
  },

  playCpu() {
    socket.send({ type: 'stranger.play_cpu' });
  },

  rate(value: 1 | -1) {
    const { lastSessionId, rated } = useStranger.getState();
    if (!lastSessionId || rated) return;
    useStranger.setState({ rated: value });
    socket.send({ type: 'stranger.rate', session_id: lastSessionId, value });
  },

  markReported(how: 'reported' | 'blocked') {
    push({ kind: 'system', text: ENDED_TEXT[how] });
  },

  reset() {
    useStranger.setState({ ...initial });
  },
};

// ── Server events ────────────────────────────────────────────────────────────

let wired = false;

export function wireStrangerEvents(onSuspended: () => void) {
  if (wired) return;
  wired = true;

  socket.on('stranger.searching', () => useStranger.setState({ phase: 'searching', blocker: null }));

  socket.on('stranger.matched', (e) => {
    const s = useStranger.getState();
    if (e.resumed && s.sessionId === e.session_id) return;
    useStranger.setState({
      ...initial,
      phase: 'chatting',
      sessionId: e.session_id as string,
      commonInterests: (e.common_interests as string[]) ?? [],
      cpu: Boolean(e.cpu),
      startedAt: Date.now(),
      lines: e.icebreaker ? [{ id: id(), kind: 'serve', by: 'table', text: e.icebreaker as string, at: Date.now() }] : [],
    });
  });

  socket.on('stranger.serve', (e) => {
    push({ kind: 'serve', by: e.by === 'you' ? 'you' : 'stranger', text: e.text as string });
  });

  socket.on('stranger.message', (e) => {
    useStranger.setState({ partnerTyping: false });
    push({
      kind: 'stranger', text: e.text as string, at: Date.parse(e.at as string) || Date.now(),
      mid: e.id as string, replyTo: (e.reply_to as string) ?? null,
    });
    hit('stranger');
  });

  socket.on('stranger.ack', (e) => {
    useStranger.setState((s) => ({
      lines: s.lines.map((l) => (l.id === e.client_id ? { ...l, status: 'sent', mid: e.id as string, replyTo: (e.reply_to as string) ?? null } : l)),
    }));
    hit('you');
  });

  const patchByMid = (mid: unknown, patch: (l: Line) => Line) =>
    useStranger.setState((s) => ({ lines: s.lines.map((l) => (l.mid === mid ? patch(l) : l)) }));

  socket.on('stranger.reaction', (e) =>
    patchByMid(e.message_id, (l) => {
      const reactions = { ...(l.reactions ?? {}) };
      const side = e.by as Side;
      if (e.emoji) reactions[side] = e.emoji as string;
      else delete reactions[side];
      return { ...l, reactions };
    }));

  socket.on('stranger.edited', (e) => patchByMid(e.message_id, (l) => ({ ...l, text: e.text as string, edited: true })));

  socket.on('stranger.edit_rejected', (e) => {
    push({ kind: 'notice', text: `Edit not saved: ${e.notice as string}`, tone: 'warning' });
  });

  socket.on('stranger.unsent', (e) => patchByMid(e.message_id, (l) => ({ ...l, deleted: true, reactions: {} })));

  socket.on('stranger.seen', (e) => {
    // Seen up to this message: everything of yours before it was seen too.
    useStranger.setState((s) => {
      const idx = s.lines.findIndex((l) => l.mid === e.message_id);
      if (idx === -1) return {};
      return { lines: s.lines.map((l, i) => (i <= idx && l.kind === 'you' && l.status === 'sent' ? { ...l, seen: true } : l)) };
    });
  });

  socket.on('stranger.rejected', (e) => {
    const notice = (e.notice as string) || 'Message not sent.';
    const known = useStranger.getState().lines.some((l) => l.id === e.client_id);
    if (known) {
      useStranger.setState((s) => ({
        lines: s.lines.map((l) => (l.id === e.client_id ? { ...l, status: 'rejected', reason: notice } : l)),
      }));
    } else {
      push({ kind: 'notice', text: notice, tone: 'warning' });
    }
  });

  socket.on('stranger.notice', (e) => {
    push({ kind: 'notice', text: e.text as string, tone: (e.level as Line['tone']) || 'info' });
  });

  socket.on('stranger.support', (e) => push({ kind: 'notice', text: e.text as string, tone: 'support' }));

  socket.on('stranger.typing', (e) => useStranger.setState({ partnerTyping: Boolean(e.typing) }));

  socket.on('stranger.ended', (e) => {
    const s = useStranger.getState();
    // Only the current match can end. A late "ended" for a match you already
    // skipped must not disturb the new search.
    if (e.session_id && s.sessionId !== e.session_id) return;
    const text = s.cpu && e.reason === 'partner_left' ? 'The CPU left the table.' : ENDED_TEXT[e.reason as string] ?? 'Chat ended.';
    push({ kind: 'system', text });
    useStranger.setState({
      phase: s.phase === 'banned' ? 'banned' : 'ended',
      lastSessionId: s.sessionId ?? s.lastSessionId,
      sessionId: null,
      partnerTyping: false,
      endedAt: Date.now(),
      endReason: (e.reason as string) ?? null,
    });
  });

  socket.on('stranger.idle', () => {
    const s = useStranger.getState();
    if (s.phase === 'searching') useStranger.setState({ phase: 'idle' });
  });

  socket.on('stranger.connect_pending', () => {
    useStranger.setState({ connect: 'pending' });
    push({ kind: 'notice', text: 'Friend request sent. If they add you too, you’ll both see each other’s usernames.', tone: 'info' });
  });

  socket.on('stranger.connect_requested', () => {
    useStranger.setState((s) => ({ connect: s.connect === 'pending' ? 'pending' : 'requested' }));
    push({ kind: 'notice', text: 'Stranger wants to add you as a friend. Add them back to reveal usernames.', tone: 'info' });
  });

  socket.on('stranger.connected', (e) => {
    const friend = e.friend as { id: string; username: string };
    useStranger.setState({ connect: 'connected', friend, conversationId: e.conversation_id as string });
    push({ kind: 'notice', text: `You're now friends with ${friend.username}.`, tone: 'info' });
  });

  socket.on('moderation.banned', (e) => {
    useStranger.setState({
      phase: 'banned',
      sessionId: null,
      ban: { until: (e.until as string) ?? null, permanent: Boolean(e.permanent), reason: (e.reason as string) ?? null },
    });
  });

  socket.on('moderation.warning', (e) => push({ kind: 'notice', text: `Moderator: ${e.text}`, tone: 'danger' }));

  socket.on('account.suspended', () => onSuspended());

  socket.on('error', (e) => {
    if (e.code === 'onboarding_required' || e.code === 'underage') {
      useStranger.setState({ phase: 'idle', blocker: e.code });
    } else if (e.detail) {
      push({ kind: 'notice', text: e.detail as string, tone: 'warning' });
    }
  });

  socket.on('socket.closed', () => {
    const s = useStranger.getState();
    if (s.phase === 'chatting' || s.phase === 'searching') {
      push({ kind: 'system', text: 'Connection lost.' });
      useStranger.setState({
        phase: s.phase === 'chatting' ? 'ended' : 'idle',
        lastSessionId: s.sessionId ?? s.lastSessionId,
        sessionId: null,
        partnerTyping: false,
        endedAt: Date.now(),
        endReason: 'connection',
      });
    }
  });
}
