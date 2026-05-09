'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useStore } from '@/lib/store';
import SearchUsers from '@/components/friends/SearchUsers';
import FriendRequestCard from '@/components/friends/FriendRequestCard';
import { useRouter } from 'next/navigation';

interface Friend {
  id: number;
  username: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
  friendship_id: number;
}

interface PendingRequest {
  id: number;
  requester: {
    id: number;
    username: string;
    avatar_url: string | null;
    is_online: boolean;
    last_seen: string;
  };
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const { onlineUsers } = useStore();
  const router = useRouter();

  useEffect(() => {
    api.get('/friends').then(({ data }) => setFriends(data));
    api.get('/friends/pending').then(({ data }) => setPending(data));
  }, []);

  async function handleMessage(userId: number) {
    const { data } = await api.post('/conversations', { user_id: userId });
    router.push(`/conversations/${data.conversation_id}`);
  }

  function handleRequestHandled(requestId: number) {
    setPending((prev) => prev.filter((r) => r.id !== requestId));
    // Refresh friends list
    api.get('/friends').then(({ data }) => setFriends(data));
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-y-auto pb-20 md:pb-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold text-white">Friends</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your friends and requests</p>
      </div>

      <div className="overflow-y-auto flex-1 px-6 py-5 space-y-8">
        {/* Search */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Find people</h2>
          <SearchUsers />
        </section>

        {/* Pending Requests */}
        {pending.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Pending requests
              <span className="ml-2 bg-indigo-500 text-white text-xs rounded-full px-1.5 py-0.5">{pending.length}</span>
            </h2>
            <div className="space-y-2">
              {pending.map((req) => (
                <FriendRequestCard key={req.id} request={req} onHandled={handleRequestHandled} />
              ))}
            </div>
          </section>
        )}

        {/* Friends List */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Friends <span className="text-gray-600 font-normal">({friends.length})</span>
          </h2>
          {friends.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">
              You haven&apos;t added any friends yet. Search above to connect!
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((friend) => {
                const isOnline = onlineUsers.has(friend.id) || friend.is_online;
                return (
                  <div key={friend.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl hover:bg-gray-750 transition-colors">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden">
                        {friend.avatar_url ? (
                          <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span>{friend.username.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-800 ${
                          isOnline ? 'bg-emerald-400' : 'bg-gray-600'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{friend.username}</p>
                      <p className="text-xs text-gray-500">{isOnline ? '🟢 Online' : 'Offline'}</p>
                    </div>
                    <button
                      id={`message-friend-${friend.id}`}
                      onClick={() => handleMessage(friend.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                    >
                      Message
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
