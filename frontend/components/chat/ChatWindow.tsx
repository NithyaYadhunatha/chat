'use client';

import { useEffect, useRef, useCallback } from 'react';

import { useStore } from '@/lib/store';
import { useMessages } from '@/hooks/useMessages';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { MessageOut } from '@/lib/store';

function DateDivider({ date }: { date: string }) {
  const d = parseISO(date);
  let label: string;
  if (isToday(d)) label = 'Today';
  else if (isYesterday(d)) label = 'Yesterday';
  else label = format(d, 'MMMM d, yyyy');
  return (
    <div className="flex items-center gap-3 my-4 px-2">
      <div className="flex-1 h-px bg-gray-800" />
      <span className="text-xs text-gray-500 flex-shrink-0 font-medium">{label}</span>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

function groupByDate(messages: MessageOut[]) {
  const groups: { date: string; messages: MessageOut[] }[] = [];
  for (const msg of messages) {
    const date = msg.created_at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.messages.push(msg);
    } else {
      groups.push({ date, messages: [msg] });
    }
  }
  return groups;
}

interface Props {
  conversationId: string; // MongoDB ObjectID string
  otherUser: { id: string; username: string; avatar_url: string | null; is_online: boolean; last_seen: string };
}

export default function ChatWindow({ conversationId, otherUser }: Props) {
  const { currentUser, typingUsers, clearUnread } = useStore();
  const { messages, loading, hasMore, fetchInitial, fetchOlder } = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    fetchInitial().then(() => {
      initialLoadDone.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
    clearUnread(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    const el = scrollAreaRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleScroll = useCallback(async () => {
    const el = scrollAreaRef.current;
    if (!el || !hasMore || loading) return;
    if (el.scrollTop < 80) {
      const prevHeight = el.scrollHeight;
      await fetchOlder();
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevHeight;
      });
    }
  }, [hasMore, loading, fetchOlder]);

  const typingList = typingUsers[conversationId] ?? [];
  const isTyping = typingList.includes(otherUser.id);
  const groups = groupByDate(messages);

  let lastSeenText = '';
  try { lastSeenText = format(parseISO(otherUser.last_seen), 'h:mm a'); } catch {}

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0 bg-gray-900/95 backdrop-blur-sm">
        <div className="relative">
          <Avatar className="w-9 h-9">
            <AvatarImage src={otherUser.avatar_url ?? undefined} alt={otherUser.username} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-bold">
              {otherUser.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${otherUser.is_online ? 'bg-emerald-400' : 'bg-gray-600'}`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{otherUser.username}</p>
          <p className="text-xs">
            {otherUser.is_online
              ? <span className="text-emerald-400">● Online</span>
              : <span className="text-gray-500">Last seen at {lastSeenText}</span>}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {loading && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {groups.map((group) => (
          <div key={group.date}>
            <DateDivider date={`${group.date}T00:00:00`} />
            {group.messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.sender_id === currentUser?.id}
                showAvatar={i === 0 || group.messages[i - 1]?.sender_id !== msg.sender_id}
              />
            ))}
          </div>
        ))}
        {isTyping && <TypingIndicator username={otherUser.username} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput conversationId={conversationId} otherUserId={otherUser.id} />
    </div>
  );
}
