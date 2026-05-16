import { create } from 'zustand';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface UserPublic {
  id: string; // MongoDB ObjectID string
  username: string;
  email?: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
}

export interface MessageOut {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  is_read: boolean;
  created_at: string;
  sender: UserPublic;
}

export interface ConversationOut {
  id: string;
  created_at: string;
  other_user: UserPublic;
  last_message: MessageOut | null;
  unread_count: number;
}

// ── Stranger chat types ───────────────────────────────────────────────────────

export type StrangerState = 'idle' | 'waiting' | 'chatting';

export interface StrangerMessage {
  id: string; // client-generated uuid
  content: string;
  sender_id: string | 'me' | 'stranger';
  created_at: string;
  is_own: boolean;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AppState {
  // Auth
  currentUser: UserPublic | null;
  accessToken: string | null;
  setCurrentUser: (user: UserPublic | null) => void;
  setAccessToken: (token: string | null) => void;

  // Conversations (friends)
  conversations: ConversationOut[];
  setConversations: (convs: ConversationOut[]) => void;
  upsertConversation: (conv: ConversationOut) => void;

  // Messages cache: conversation_id → MessageOut[]
  messagesCache: Record<string, MessageOut[]>;
  setMessages: (convId: string, msgs: MessageOut[]) => void;
  prependMessages: (convId: string, msgs: MessageOut[]) => void;
  appendMessage: (convId: string, msg: MessageOut) => void;
  replaceMessage: (convId: string, tempId: string, msg: MessageOut) => void;
  removeMessage: (convId: string, msgId: string) => void;
  markRead: (convId: string) => void;

  // Unread counts
  unreadCounts: Record<string, number>;
  incrementUnread: (convId: string) => void;
  clearUnread: (convId: string) => void;

  // Online users
  onlineUsers: Set<string>;
  setUserOnline: (userId: string, online: boolean) => void;

  // Typing
  typingUsers: Record<string, string[]>;
  setTyping: (convId: string, userId: string, isTyping: boolean) => void;

  // ── Stranger chat slice ─────────────────────────────────────────────────────
  strangerState: StrangerState;
  strangerSessionId: string | null;
  strangerMessages: StrangerMessage[];
  strangerOnlineCount: number;

  setStrangerState: (state: StrangerState) => void;
  setStrangerSessionId: (id: string | null) => void;
  appendStrangerMessage: (msg: StrangerMessage) => void;
  clearStrangerMessages: () => void;
  setStrangerOnlineCount: (count: number) => void;
  resetStrangerSession: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  // ── Auth ────────────────────────────────────────────────────────────────────
  currentUser: null,
  accessToken: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  setAccessToken: (token) => {
    set({ accessToken: token });
    if (typeof window !== 'undefined') {
      (window as any).__access_token = token;
    }
  },

  // ── Conversations ───────────────────────────────────────────────────────────
  conversations: [],
  setConversations: (convs) => set({ conversations: convs }),
  upsertConversation: (conv) =>
    set((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conv.id);
      if (idx === -1) return { conversations: [conv, ...s.conversations] };
      const updated = [...s.conversations];
      updated[idx] = conv;
      return { conversations: updated };
    }),

  // ── Messages cache ──────────────────────────────────────────────────────────
  messagesCache: {},
  setMessages: (convId, msgs) =>
    set((s) => ({ messagesCache: { ...s.messagesCache, [convId]: msgs } })),
  prependMessages: (convId, msgs) =>
    set((s) => ({
      messagesCache: {
        ...s.messagesCache,
        [convId]: [...msgs, ...(s.messagesCache[convId] ?? [])],
      },
    })),
  appendMessage: (convId, msg) =>
    set((s) => {
      const existing = s.messagesCache[convId] ?? [];
      // Deduplicate: skip if a message with the same ID is already present
      if (existing.some((m) => m.id === msg.id)) return {};
      return {
        messagesCache: {
          ...s.messagesCache,
          [convId]: [...existing, msg],
        },
      };
    }),
  replaceMessage: (convId, tempId, msg) =>
    set((s) => {
      const existing = s.messagesCache[convId] ?? [];
      // If the real ID is already in the list (from WS), just remove the temp
      const hasReal = existing.some((m) => m.id === msg.id);
      const next = hasReal
        ? existing.filter((m) => m.id !== tempId)
        : existing.map((m) => (m.id === tempId ? msg : m));
      return { messagesCache: { ...s.messagesCache, [convId]: next } };
    }),
  removeMessage: (convId, msgId) =>
    set((s) => ({
      messagesCache: {
        ...s.messagesCache,
        [convId]: (s.messagesCache[convId] ?? []).filter((m) => m.id !== msgId),
      },
    })),
  markRead: (convId) =>
    set((s) => ({
      messagesCache: {
        ...s.messagesCache,
        [convId]: (s.messagesCache[convId] ?? []).map((m) => ({ ...m, is_read: true })),
      },
    })),

  // ── Unread counts ───────────────────────────────────────────────────────────
  unreadCounts: {},
  incrementUnread: (convId) =>
    set((s) => ({
      unreadCounts: { ...s.unreadCounts, [convId]: (s.unreadCounts[convId] ?? 0) + 1 },
    })),
  clearUnread: (convId) =>
    set((s) => ({ unreadCounts: { ...s.unreadCounts, [convId]: 0 } })),

  // ── Online users ────────────────────────────────────────────────────────────
  onlineUsers: new Set(),
  setUserOnline: (userId, online) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      online ? next.add(userId) : next.delete(userId);
      return { onlineUsers: next };
    }),

  // ── Typing ──────────────────────────────────────────────────────────────────
  typingUsers: {},
  setTyping: (convId, userId, isTyping) =>
    set((s) => {
      const current = s.typingUsers[convId] ?? [];
      const next = isTyping
        ? current.includes(userId) ? current : [...current, userId]
        : current.filter((id) => id !== userId);
      return { typingUsers: { ...s.typingUsers, [convId]: next } };
    }),

  // ── Stranger chat ───────────────────────────────────────────────────────────
  strangerState: 'idle',
  strangerSessionId: null,
  strangerMessages: [],
  strangerOnlineCount: 0,

  setStrangerState: (state) => set({ strangerState: state }),
  setStrangerSessionId: (id) => set({ strangerSessionId: id }),
  appendStrangerMessage: (msg) =>
    set((s) => ({ strangerMessages: [...s.strangerMessages, msg] })),
  clearStrangerMessages: () => set({ strangerMessages: [] }),
  setStrangerOnlineCount: (count) => set({ strangerOnlineCount: count }),
  resetStrangerSession: () =>
    set({
      strangerState: 'idle',
      strangerSessionId: null,
      strangerMessages: [],
    }),
}));
