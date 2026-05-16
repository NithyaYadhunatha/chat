'use client';

export const dynamic = 'force-dynamic';

import { useStore } from '@/lib/store';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';

export default function ConversationsPage() {
  const { conversations } = useStore();

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Messages</h1>
        <p className="text-sm text-gray-500 mt-0.5">{conversations.length} conversations</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-300">No conversations yet</h2>
            <p className="text-sm text-gray-500 mt-2 max-w-xs">
              Add a friend and start chatting. Your conversations will appear here.
            </p>
            <Link
              href="/friends"
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Find friends
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {conversations.map((conv) => (
              <Link key={conv.id} href={`/conversations/${conv.id}`}>
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-800/50 transition-colors cursor-pointer">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden">
                      {conv.other_user.avatar_url ? (
                        <img src={conv.other_user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span>{conv.other_user.username.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-900 ${
                        conv.other_user.is_online ? 'bg-emerald-400' : 'bg-gray-600'
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{conv.other_user.username}</span>
                      {conv.last_message && (
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(parseISO(conv.last_message.created_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-0.5">
                      {conv.last_message?.content ?? 'No messages yet'}
                    </p>
                  </div>

                  {/* Unread */}
                  {conv.unread_count > 0 && (
                    <span className="flex-shrink-0 bg-indigo-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
