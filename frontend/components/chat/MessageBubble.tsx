'use client';

import { MessageOut } from '@/lib/store';
import { format, parseISO } from 'date-fns';

interface Props {
  message: MessageOut;
  isOwn: boolean;
  showAvatar: boolean;
}

export default function MessageBubble({ message, isOwn, showAvatar }: Props) {
  let timeStr = '';
  try {
    timeStr = format(parseISO(message.created_at), 'h:mm a');
  } catch {}

  const initials = message.sender.username.slice(0, 2).toUpperCase();

  return (
    <div className={`flex items-end gap-2 mb-1 animate-fade-in ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar (other user only) */}
      {!isOwn && (
        <div className="flex-shrink-0 w-7 h-7">
          {showAvatar && (
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
              {message.sender.avatar_url ? (
                <img src={message.sender.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span style={{ fontSize: '9px' }}>{initials}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bubble group */}
      <div className={`group flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
            isOwn
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : 'bg-gray-800 text-gray-100 rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>

        {/* Timestamp + read receipt */}
        <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <span className="text-xs text-gray-600">{timeStr}</span>
          {isOwn && (
            <span className="text-xs">
              {message.is_read ? (
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
