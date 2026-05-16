'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import api from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';

interface Props {
  conversationId: string; // MongoDB ObjectID string
  otherUserId: string;
}

export default function MessageInput({ conversationId, otherUserId }: Props) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendTyping } = useWebSocket();

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(conversationId, true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(conversationId, false);
    }, 1500);
  }, [conversationId, sendTyping]);

  // Auto-resize textarea
  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    isTypingRef.current = false;
    sendTyping(conversationId, false);

    // Optimistic update — show the message immediately in the UI
    const { currentUser, appendMessage, upsertConversation, conversations } =
      useStore.getState();
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUser?.id ?? '',
      content: trimmed,
      message_type: 'text',
      is_read: false,
      created_at: new Date().toISOString(),
      sender: currentUser!,
    };
    appendMessage(conversationId, optimisticMsg);
    const conv = conversations.find((c) => c.id === conversationId);
    if (conv) upsertConversation({ ...conv, last_message: optimisticMsg });

    // Clear input immediately for responsive feel
    setContent('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const { data: savedMsg } = await api.post(
        `/conversations/${conversationId}/messages`,
        { content: trimmed }
      );
      // Replace the temp message with the server-confirmed one
      useStore.getState().replaceMessage(conversationId, tempId, savedMsg);
    } catch (e) {
      console.error(e);
      // Remove the optimistic message on failure
      useStore.getState().removeMessage(conversationId, tempId);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="px-4 py-3 border-t border-gray-800 bg-gray-900 flex-shrink-0">
      <div className="flex items-end gap-2 bg-gray-800 rounded-2xl border border-gray-700 px-3 py-2.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all duration-150">
        {/* Emoji placeholder */}
        <Button
          id="emoji-btn"
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-500 hover:text-gray-300 hover:bg-transparent flex-shrink-0 mb-0.5"
          title="Emoji (coming soon)"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </Button>

        <textarea
          id="message-input"
          ref={textareaRef}
          rows={1}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleTyping();
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none max-h-32 leading-relaxed py-0.5"
          style={{ scrollbarWidth: 'none' }}
        />

        <Button
          id="send-btn"
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={!content.trim() || sending}
          className="flex-shrink-0 mb-0.5 h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-95"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </Button>
      </div>
      <p className="text-[10px] text-gray-600 mt-1.5 text-center">↵ to send &nbsp;·&nbsp; Shift+↵ for new line</p>
    </div>
  );
}
