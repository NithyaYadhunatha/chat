'use client';

import { useState, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useStore, MessageOut } from '@/lib/store';

export function useMessages(conversationId: string) {
  const { messagesCache, setMessages, prependMessages } = useStore();
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextCursorRef = useRef<string | null>(null);

  const messages = messagesCache[conversationId] ?? [];

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`);
      setMessages(conversationId, data.messages);
      nextCursorRef.current = data.next_cursor;
      setHasMore(data.next_cursor !== null);
    } finally {
      setLoading(false);
    }
  }, [conversationId, setMessages]);

  const fetchOlder = useCallback(async () => {
    if (!hasMore || loading) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (nextCursorRef.current) params.before = nextCursorRef.current;
      const { data } = await api.get(`/conversations/${conversationId}/messages`, { params });
      prependMessages(conversationId, data.messages);
      nextCursorRef.current = data.next_cursor;
      setHasMore(data.next_cursor !== null);
    } finally {
      setLoading(false);
    }
  }, [conversationId, hasMore, loading, prependMessages]);

  return { messages, loading, hasMore, fetchInitial, fetchOlder };
}
