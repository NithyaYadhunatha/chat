'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';

type WsEvent = {
  type: string;
  mode?: 'friends' | 'stranger';
  [key: string]: any;
};

const MAX_BACKOFF = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const { currentUser, accessToken } = useStore();
  const {
    appendMessage,
    upsertConversation,
    incrementUnread,
    setUserOnline,
    setTyping,
    conversations,
    // Stranger
    setStrangerState,
    setStrangerSessionId,
    appendStrangerMessage,
    setStrangerOnlineCount,
    resetStrangerSession,
    strangerOnlineCount,
  } = useStore();

  // Generic WS sender — exposed for components to use
  const sendEvent = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const handleFriendsEvent = useCallback(
    (event: WsEvent) => {
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
          const conv = conversations.find((c) => c.id === event.conversation_id);
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
    },
    [appendMessage, upsertConversation, incrementUnread, setUserOnline, setTyping, currentUser, conversations]
  );

  const handleStrangerEvent = useCallback(
    (event: WsEvent) => {
      switch (event.type) {
        case 'queued':
          setStrangerState('waiting');
          break;

        case 'matched':
          setStrangerState('chatting');
          setStrangerSessionId(event.session_id);
          break;

        case 'message': {
          // Message from partner
          appendStrangerMessage({
            id: `stranger-${Date.now()}-${Math.random()}`,
            content: event.content,
            sender_id: 'stranger',
            created_at: event.created_at ?? new Date().toISOString(),
            is_own: false,
          });
          break;
        }

        case 'message_sent': {
          // Echo from server confirming our own message
          // (already shown optimistically; update timestamp if needed)
          break;
        }

        case 'partner_left':
          // Partner disconnected/skipped
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
    },
    [
      setStrangerState,
      setStrangerSessionId,
      appendStrangerMessage,
      setStrangerOnlineCount,
      resetStrangerSession,
    ]
  );

  const handleEvent = useCallback(
    (event: WsEvent) => {
      const mode = event.mode ?? 'friends';
      if (mode === 'stranger') {
        handleStrangerEvent(event);
      } else {
        handleFriendsEvent(event);
      }
    },
    [handleFriendsEvent, handleStrangerEvent]
  );

  const connect = useCallback(() => {
    if (!currentUser || !accessToken) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws/${currentUser.id}?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = 1000;
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WsEvent;
        handleEvent(data);
      } catch {}
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        connect();
      }, backoffRef.current);
    };

    ws.onerror = () => ws.close();
  }, [currentUser, accessToken, handleEvent]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Public API ──────────────────────────────────────────────────────────────

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
