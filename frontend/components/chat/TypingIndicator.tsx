'use client';

export default function TypingIndicator({ username }: { username: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 animate-fade-in">
      <div className="flex items-center gap-0.5">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="text-xs text-gray-500">{username} is typing…</span>
    </div>
  );
}
