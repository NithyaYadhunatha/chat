'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';

type WsEvent = {
  type: string;
  mode?: 'friends' | 'stranger';
  [key: string]: any;
};

const MAX_BACKOFF = 30000;

// Singleton WS ref — shared across all hook instances so only one connection
// is ever opened, regardless of how many components call useWebSocket().
let _wsRef: WebSocket | null = null;
let _mountCount = 0;

export function useWebSocket() {
  const backoffRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest event handler in a ref so the connect function never
  // needs to be recreated (breaking the reconnect-on-state-change loop).
  const handleEventRef = useRef<(event: WsEvent) => void>(() => {});

  const store = useStore();

  // Build the handler and always keep the ref up-to-date.
  // This runs on every render but does NOT trigger a new WS connection.
  const handleFriendsEvent = useCallback((event: WsEvent) => {
    // Read latest store state directly to avoid stale-closure bugs.
    const {
      appendMessage,
      upsertConversation,
      incrementUnread,
      setUserOnline,
      setTyping,
      currentUser,
    } = useStore.getState();

    switch (event.type) {
      case 'message': {
        const msg = {
          id: event.id,
          conversation_id: event.conversation_id,
          sender_id: event.sender_id,
          content: event.content,
          message_type: event.message_type,
          is_read: event.is_read,
          created_at: event.created_at,
          sender: event.sender,
        };
        appendMessage(event.conversation_id, msg);
        // Get conversations fresh from store to avoid stale ref
        const conv = useStore.getState().conversations.find((c) => c.id === event.conversation_id);
        if (conv) {
          upsertConversation({ ...conv, last_message: msg });
        }
        if (event.sender_id !== currentUser?.id) {
          incrementUnread(event.conversation_id);
        }
        break;
      }
      case 'presence':
        setUserOnline(event.user_id, event.is_online);
        break;
      case 'typing':
        setTyping(event.conversation_id, event.user_id, event.is_typing);
        break;
      case 'read_receipt':
        break;
      case 'friend_request':
        console.info('Friend request received', event);
        break;
    }
  }, []); // No deps — reads from store via getState() inside

  const handleStrangerEvent = useCallback((event: WsEvent) => {
    const {
      setStrangerState,
      setStrangerSessionId,
      appendStrangerMessage,
      setStrangerOnlineCount,
      resetStrangerSession,
    } = useStore.getState();

    switch (event.type) {
      case 'queued':
        setStrangerState('waiting');
        break;

      case 'matched':
        setStrangerState('chatting');
        setStrangerSessionId(event.session_id);
        break;

      case 'message':
        appendStrangerMessage({
          id: `stranger-${Date.now()}-${Math.random()}`,
          content: event.content,
          sender_id: 'stranger',
          created_at: event.created_at ?? new Date().toISOString(),
          is_own: false,
        });
        break;

      case 'message_sent':
        // Echo from server — already shown optimistically
        break;

      case 'partner_left':
        appendStrangerMessage({
          id: `sys-${Date.now()}`,
          content: '👋 Your chat partner has left.',
          sender_id: 'system',
          created_at: new Date().toISOString(),
          is_own: false,
        });
        setStrangerState('idle');
        setStrangerSessionId(null);
        break;

      case 'warning':
        appendStrangerMessage({
          id: `warn-${Date.now()}`,
          content: `⚠️ ${event.reason}`,
          sender_id: 'system',
          created_at: new Date().toISOString(),
          is_own: false,
        });
        break;

      case 'banned':
        appendStrangerMessage({
          id: `ban-${Date.now()}`,
          content: `🚫 ${event.reason}`,
          sender_id: 'system',
          created_at: new Date().toISOString(),
          is_own: false,
        });
        resetStrangerSession();
        break;

      case 'already_in_session':
        setStrangerState('chatting');
        setStrangerSessionId(event.session_id);
        break;

      case 'error':
        console.warn('[Stranger WS error]', event.detail);
        break;

      case 'online_count':
        setStrangerOnlineCount(event.count ?? 0);
        break;
    }
  }, []); // No deps — reads from store via getState() inside

  // Update the ref every render so it always points to the latest handler.
  handleEventRef.current = useCallback((event: WsEvent) => {
    const mode = event.mode ?? 'friends';
    if (mode === 'stranger') {
      handleStrangerEvent(event);
    } else {
      handleFriendsEvent(event);
    }
  }, [handleFriendsEvent, handleStrangerEvent]);

  // connect() is stable — it never changes, so the useEffect fires only once.
  const connect = useCallback(() => {
    const { currentUser, accessToken } = useStore.getState();
    if (!currentUser || !accessToken) return;
    if (_wsRef?.readyState === WebSocket.OPEN || _wsRef?.readyState === WebSocket.CONNECTING) return;

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws/${currentUser.id}?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);
    _wsRef = ws;

    ws.onopen = () => {
      backoffRef.current = 1000;
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WsEvent;
        // Always call through the ref so we use the latest handler.
        handleEventRef.current(data);
      } catch {}
    };

    ws.onclose = () => {
      _wsRef = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        connect();
      }, backoffRef.current);
    };

    ws.onerror = () => ws.close();
  }, []); // Stable — no deps change it

  useEffect(() => {
    _mountCount++;
    connect();

    // Watch for when the user/token becomes available (after bootstrap)
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (
        state.currentUser && state.accessToken &&
        (!prev.currentUser || !prev.accessToken)
      ) {
        connect();
      }
    });

    return () => {
      unsubscribe();
      _mountCount--;
      if (_mountCount === 0) {
        // Last consumer unmounting — close the WS
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        _wsRef?.close();
        _wsRef = null;
      }
    };
  }, []); // Empty deps — runs once

  // ── Public API ──────────────────────────────────────────────────────────────

  const sendEvent = useCallback((data: Record<string, unknown>) => {
    if (_wsRef?.readyState === WebSocket.OPEN) {
      _wsRef.send(JSON.stringify(data));
    }
  }, []);

  const sendTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      sendEvent({ type: 'typing', mode: 'friends', conversation_id: conversationId, is_typing: isTyping });
    },
    [sendEvent]
  );

  const joinQueue = useCallback(() => {
    sendEvent({ type: 'join_queue', mode: 'stranger' });
  }, [sendEvent]);

  const leaveQueue = useCallback(() => {
    sendEvent({ type: 'leave', mode: 'stranger' });
  }, [sendEvent]);

  const sendStrangerMessage = useCallback(
    (sessionId: string, content: string) => {
      sendEvent({ type: 'message', mode: 'stranger', session_id: sessionId, content });
    },
    [sendEvent]
  );

  const findNext = useCallback(
    (sessionId: string) => {
      sendEvent({ type: 'next', mode: 'stranger', session_id: sessionId });
    },
    [sendEvent]
  );

  return { sendTyping, sendEvent, joinQueue, leaveQueue, sendStrangerMessage, findNext };
}
