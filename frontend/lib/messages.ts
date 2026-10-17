'use client';

import { create } from 'zustand';
import { api } from './api';
import { socket } from './socket';
import type { Conversation, DirectMessage } from './types';

interface Thread {
  messages: DirectMessage[];
  cursor: string | null;
  loaded: boolean;
}

interface MessagesState {
  conversations: Conversation[];
  loaded: boolean;
  threads: Record<string, Thread>;
  typing: Record<string, boolean>;
  presence: Record<string, boolean>;
  requestsBadge: number;
}

export const useMessages = create<MessagesState>(() => ({
  conversations: [],
  loaded: false,
  threads: {},
  typing: {},
  presence: {},
  requestsBadge: 0,
}));

const set = useMessages.setState;
const get = useMessages.getState;

function upsertConversation(conv: Conversation) {
  set((s) => ({
    conversations: [conv, ...s.conversations.filter((c) => c.id !== conv.id)].sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    ),
  }));
}

function appendMessage(convId: string, msg: DirectMessage) {
  set((s) => {
    const t = s.threads[convId];
    if (!t || t.messages.some((m) => m.id === msg.id)) return {};
    return { threads: { ...s.threads, [convId]: { ...t, messages: [...t.messages, msg] } } };
  });
}

function replaceMessage(convId: string, messageId: string, fn: (m: DirectMessage) => DirectMessage) {
  set((s) => {
    const t = s.threads[convId];
    const target = t?.messages.find((m) => m.id === messageId);
    if (!t || !target) return {};
    const updated = fn(target);
    const msgs = t.messages.map((m) => {
      if (m.id === messageId) return updated;
      // Keep quoted previews in sync when the original is edited or unsent.
      if (m.reply_to?.id === messageId) {
        return { ...m, reply_to: { ...m.reply_to, content: updated.deleted ? '' : updated.content, deleted: Boolean(updated.deleted) } };
      }
      return m;
    });
    return { threads: { ...s.threads, [convId]: { ...t, messages: msgs } } };
  });
}

export const messages = {
  async loadConversations() {
    const conversations = await api<Conversation[]>('/conversations');
    set({ conversations, loaded: true });
  },

  async loadThread(convId: string) {
    const page = await api<{ messages: DirectMessage[]; next_cursor: string | null }>(
      `/conversations/${convId}/messages?limit=40`,
    );
    set((s) => ({
      threads: { ...s.threads, [convId]: { messages: page.messages, cursor: page.next_cursor, loaded: true } },
      conversations: s.conversations.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)),
    }));
  },

  async loadOlder(convId: string) {
    const t = get().threads[convId];
    if (!t?.cursor) return;
    const page = await api<{ messages: DirectMessage[]; next_cursor: string | null }>(
      `/conversations/${convId}/messages?limit=40&before=${t.cursor}`,
    );
    set((s) => ({
      threads: {
        ...s.threads,
        [convId]: { ...t, messages: [...page.messages, ...t.messages], cursor: page.next_cursor },
      },
    }));
  },

  async send(convId: string, myId: string, content: string, replyTo?: DirectMessage | null): Promise<{ notice?: string; support?: string }> {
    const tempId = `tmp-${Date.now()}`;
    const temp: DirectMessage = {
      id: tempId, conversation_id: convId, sender_id: myId, content,
      is_read: false, created_at: new Date().toISOString(), pending: true,
      reply_to: replyTo ? { id: replyTo.id, sender_id: replyTo.sender_id, content: replyTo.content, deleted: Boolean(replyTo.deleted) } : null,
    };
    appendMessage(convId, temp);
    try {
      const saved = await api<DirectMessage & { notice?: string; support?: string }>(
        `/conversations/${convId}/messages`, { method: 'POST', body: { content, reply_to: replyTo?.id } },
      );
      set((s) => {
        const t = s.threads[convId];
        return {
          threads: { ...s.threads, [convId]: { ...t, messages: t.messages.map((m) => (m.id === tempId ? saved : m)) } },
          conversations: s.conversations
            .map((c) => (c.id === convId
              ? { ...c, last_message: { id: saved.id, sender_id: myId, content, created_at: saved.created_at }, updated_at: saved.created_at }
              : c))
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
        };
      });
      return { notice: saved.notice, support: saved.support };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Not sent';
      set((s) => {
        const t = s.threads[convId];
        return {
          threads: {
            ...s.threads,
            [convId]: { ...t, messages: t.messages.map((m) => (m.id === tempId ? { ...m, pending: false, failed: reason } : m)) },
          },
        };
      });
      return {};
    }
  },

  async edit(convId: string, messageId: string, content: string): Promise<string | null> {
    try {
      const updated = await api<DirectMessage>(`/conversations/${convId}/messages/${messageId}`, { method: 'PATCH', body: { content } });
      replaceMessage(convId, messageId, () => updated);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Edit failed';
    }
  },

  async unsend(convId: string, messageId: string) {
    replaceMessage(convId, messageId, (m) => ({ ...m, deleted: true, content: '', reactions: [] }));
    await api(`/conversations/${convId}/messages/${messageId}`, { method: 'DELETE' }).catch(() => {});
  },

  async react(convId: string, messageId: string, myId: string, emoji: string) {
    // Optimistic toggle, then trust the server's answer.
    replaceMessage(convId, messageId, (m) => {
      const others = (m.reactions ?? []).filter((r) => r.user_id !== myId);
      const mine = (m.reactions ?? []).find((r) => r.user_id === myId);
      return { ...m, reactions: mine?.emoji === emoji ? others : [...others, { user_id: myId, emoji }] };
    });
    try {
      const res = await api<{ reactions: DirectMessage['reactions'] }>(
        `/conversations/${convId}/messages/${messageId}/reaction`, { method: 'PUT', body: { emoji } });
      replaceMessage(convId, messageId, (m) => ({ ...m, reactions: res.reactions }));
    } catch {
      /* keep optimistic state */
    }
  },

  typing(convId: string, isTyping: boolean) {
    socket.send({ type: 'dm.typing', conversation_id: convId, typing: isTyping });
  },

  markRead(convId: string) {
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)) }));
    void api(`/conversations/${convId}/read`, { method: 'POST' }).catch(() => {});
  },

  upsertConversation,
  clearRequestsBadge() {
    set({ requestsBadge: 0 });
  },
};

let wired = false;
let activeConversation: string | null = null;

export function setActiveConversation(id: string | null) {
  activeConversation = id;
}

export function wireMessageEvents() {
  if (wired) return;
  wired = true;

  socket.on('dm.message', (e) => {
    const msg = e.message as DirectMessage;
    appendMessage(msg.conversation_id, msg);
    set((s) => ({ typing: { ...s.typing, [msg.conversation_id]: false } }));
    const existing = get().conversations.find((c) => c.id === msg.conversation_id);
    if (!existing) {
      void messages.loadConversations();
      return;
    }
    const isOpen = activeConversation === msg.conversation_id && document.visibilityState === 'visible';
    upsertConversation({
      ...existing,
      last_message: { id: msg.id, sender_id: msg.sender_id, content: msg.content, created_at: msg.created_at },
      updated_at: msg.created_at,
      unread_count: isOpen ? 0 : existing.unread_count + 1,
    });
    if (isOpen) messages.markRead(msg.conversation_id);
  });

  socket.on('dm.edited', (e) => {
    const msg = e.message as DirectMessage;
    replaceMessage(msg.conversation_id, msg.id, () => msg);
  });

  socket.on('dm.deleted', (e) => {
    replaceMessage(e.conversation_id as string, e.message_id as string, (m) => ({ ...m, deleted: true, content: '', reactions: [] }));
  });

  socket.on('dm.reaction', (e) => {
    replaceMessage(e.conversation_id as string, e.message_id as string, (m) => ({ ...m, reactions: e.reactions as DirectMessage['reactions'] }));
  });

  socket.on('dm.typing', (e) => {
    const convId = e.conversation_id as string;
    set((s) => ({ typing: { ...s.typing, [convId]: Boolean(e.typing) } }));
  });

  socket.on('dm.read', (e) => {
    const convId = e.conversation_id as string;
    set((s) => {
      const t = s.threads[convId];
      if (!t) return {};
      return { threads: { ...s.threads, [convId]: { ...t, messages: t.messages.map((m) => ({ ...m, is_read: true })) } } };
    });
  });

  socket.on('presence', (e) => {
    const uid = e.user_id as string;
    set((s) => ({
      presence: { ...s.presence, [uid]: Boolean(e.online) },
      conversations: s.conversations.map((c) =>
        c.other_user.id === uid ? { ...c, other_user: { ...c.other_user, is_online: Boolean(e.online) } } : c),
    }));
  });

  socket.on('friend.request', () => set((s) => ({ requestsBadge: s.requestsBadge + 1 })));
  socket.on('friend.accepted', () => void messages.loadConversations().catch(() => {}));
  socket.on('stranger.connected', () => void messages.loadConversations().catch(() => {}));
}
