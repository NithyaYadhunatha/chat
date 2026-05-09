'use client';

import { useState, useCallback } from 'react';
import api from '@/lib/api';
import { UserPublic } from '@/lib/store';
import { useRouter } from 'next/navigation';

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

interface SearchResult extends UserPublic {
  requested?: boolean;
}

export default function SearchUsers() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const doSearch = useCallback(
    debounce(async (q: string) => {
      if (q.length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const { data } = await api.get('/users/search', { params: { q } });
        setResults(data);
      } finally {
        setLoading(false);
      }
    }, 350),
    []
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    doSearch(e.target.value);
  }

  async function sendRequest(userId: number) {
    await api.post(`/friends/request/${userId}`);
    setResults((prev) => prev.map((u) => u.id === userId ? { ...u, requested: true } : u));
  }

  async function openChat(userId: number) {
    const { data } = await api.post('/conversations', { user_id: userId });
    router.push(`/conversations/${data.conversation_id}`);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="user-search"
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search by username…"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-150"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((user) => (
            <div key={user.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl animate-fade-in">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden flex-shrink-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{user.username.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{user.username}</p>
                <p className="text-xs text-gray-500">{user.is_online ? '🟢 Online' : 'Offline'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openChat(user.id)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                >
                  Message
                </button>
                <button
                  onClick={() => sendRequest(user.id)}
                  disabled={user.requested}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-default text-white transition-colors"
                >
                  {user.requested ? 'Sent' : 'Add Friend'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
