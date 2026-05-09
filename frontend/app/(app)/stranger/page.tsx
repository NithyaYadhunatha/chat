'use client';

import { useEffect, useRef, useState, KeyboardEvent, useCallback } from 'react';
import { useStore, StrangerMessage } from '@/lib/store';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';

// ── Stranger message bubble ──────────────────────────────────────────────────

function StrangerBubble({ msg }: { msg: StrangerMessage }) {
  const isSystem = msg.sender_id === 'system';
  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="text-xs text-gray-500 bg-gray-800/60 px-3 py-1.5 rounded-full border border-gray-700/50">
          {msg.content}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex items-end gap-2 mb-1 animate-fade-in ${msg.is_own ? 'flex-row-reverse' : 'flex-row'}`}>
      {!msg.is_own && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          ?
        </div>
      )}
      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
        msg.is_own
          ? 'bg-violet-600 text-white rounded-br-sm'
          : 'bg-gray-800 text-gray-100 rounded-bl-sm'
      }`}>
        {msg.content}
      </div>
    </div>
  );
}

// ── Idle state ───────────────────────────────────────────────────────────────

function IdleScreen({ onStart, onlineCount }: { onStart: () => void; onlineCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8 text-center">
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-2xl shadow-violet-900/50">
          <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
          </svg>
        </div>
        {onlineCount > 0 && (
          <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-gray-950 animate-pulse">
            {onlineCount}
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Chat with a Stranger</h1>
        <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
          Connect anonymously with someone new. Your identity stays private.
        </p>
        {onlineCount > 0 && (
          <p className="text-emerald-400 text-xs mt-2 font-medium">
            {onlineCount} {onlineCount === 1 ? 'person' : 'people'} online now
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          id="stranger-start-btn"
          onClick={onStart}
          className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-violet-900/40 active:scale-95 text-sm"
        >
          Start Chatting →
        </button>
        <p className="text-xs text-gray-600">
          By chatting, you agree to our community guidelines.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs mt-2">
        {[
          { icon: '🎭', label: 'Anonymous' },
          { icon: '⚡', label: 'Instant match' },
          { icon: '🛡️', label: 'Moderated' },
        ].map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-1.5 bg-gray-900 rounded-xl py-3 px-2 border border-gray-800">
            <span className="text-xl">{f.icon}</span>
            <span className="text-xs text-gray-500 font-medium">{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Waiting state ────────────────────────────────────────────────────────────

function WaitingScreen({ onCancel }: { onCancel: () => void }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="relative">
        <div className="w-20 h-20 rounded-full border-2 border-violet-500/30 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-2 border-violet-500/60 flex items-center justify-center">
            <div className="w-12 h-12 border-2 border-t-violet-500 border-violet-500/20 rounded-full animate-spin" />
          </div>
        </div>
      </div>
      <div>
        <p className="text-white font-semibold text-lg">Looking for someone{dots}</p>
        <p className="text-gray-500 text-sm mt-1">You'll be matched shortly</p>
      </div>
      <button
        id="stranger-cancel-btn"
        onClick={onCancel}
        className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors text-sm border border-gray-700"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Chat state ───────────────────────────────────────────────────────────────

function ChatScreen({
  messages,
  sessionId,
  onNext,
  onLeave,
  onSend,
}: {
  messages: StrangerMessage[];
  sessionId: string;
  onNext: () => void;
  onLeave: () => void;
  onSend: (content: string) => void;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0 bg-gray-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm">
            ?
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Stranger</p>
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Connected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="stranger-next-btn"
            onClick={onNext}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 text-xs font-medium rounded-lg transition-colors border border-violet-600/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            Next
          </button>
          <button
            id="stranger-leave-btn"
            onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs font-medium rounded-lg transition-colors border border-red-900/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Leave
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5">
        {messages.length === 0 && (
          <div className="flex justify-center mt-8">
            <p className="text-xs text-gray-600 bg-gray-800/50 px-4 py-2 rounded-full border border-gray-700/50">
              You're connected! Say hello 👋
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <StrangerBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900 flex-shrink-0">
        <div className="flex items-end gap-2 bg-gray-800 rounded-2xl border border-gray-700 px-3 py-2.5 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500/50 transition-all duration-150">
          <textarea
            id="stranger-message-input"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none focus:outline-none max-h-32 leading-relaxed py-0.5"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            id="stranger-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex-shrink-0 mb-0.5 h-8 w-8 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5 text-center">↵ to send · Shift+↵ for new line</p>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function StrangerPage() {
  const {
    strangerState,
    strangerSessionId,
    strangerMessages,
    strangerOnlineCount,
    setStrangerOnlineCount,
    appendStrangerMessage,
    clearStrangerMessages,
    resetStrangerSession,
  } = useStore();

  const { joinQueue, leaveQueue, sendStrangerMessage, findNext } = useWebSocket();

  // Poll online count every 30s
  useEffect(() => {
    async function fetchCount() {
      try {
        const { data } = await api.get('/stranger/status');
        setStrangerOnlineCount(data.online_count ?? 0);
      } catch {}
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [setStrangerOnlineCount]);

  const handleStart = useCallback(() => {
    clearStrangerMessages();
    joinQueue();
  }, [clearStrangerMessages, joinQueue]);

  const handleCancel = useCallback(() => {
    leaveQueue();
    resetStrangerSession();
  }, [leaveQueue, resetStrangerSession]);

  const handleNext = useCallback(() => {
    if (!strangerSessionId) return;
    clearStrangerMessages();
    findNext(strangerSessionId);
  }, [strangerSessionId, clearStrangerMessages, findNext]);

  const handleLeave = useCallback(() => {
    leaveQueue();
    resetStrangerSession();
  }, [leaveQueue, resetStrangerSession]);

  const handleSend = useCallback(
    (content: string) => {
      if (!strangerSessionId) return;
      // Optimistic: add own message immediately
      appendStrangerMessage({
        id: `own-${Date.now()}-${Math.random()}`,
        content,
        sender_id: 'me',
        created_at: new Date().toISOString(),
        is_own: true,
      });
      sendStrangerMessage(strangerSessionId, content);
    },
    [strangerSessionId, appendStrangerMessage, sendStrangerMessage]
  );

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {strangerState === 'idle' && (
        <IdleScreen onStart={handleStart} onlineCount={strangerOnlineCount} />
      )}
      {strangerState === 'waiting' && (
        <WaitingScreen onCancel={handleCancel} />
      )}
      {strangerState === 'chatting' && strangerSessionId && (
        <ChatScreen
          messages={strangerMessages}
          sessionId={strangerSessionId}
          onNext={handleNext}
          onLeave={handleLeave}
          onSend={handleSend}
        />
      )}
    </div>
  );
}
