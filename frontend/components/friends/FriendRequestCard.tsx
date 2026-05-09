'use client';

import api from '@/lib/api';

interface FriendRequest {
  id: string;
  requester: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_online: boolean;
    last_seen: string;
  };
}

interface Props {
  request: FriendRequest;
  onHandled: (id: string) => void;
}

export default function FriendRequestCard({ request, onHandled }: Props) {
  async function accept() {
    await api.post(`/friends/accept/${request.id}`);
    onHandled(request.id);
  }

  async function reject() {
    await api.post(`/friends/reject/${request.id}`);
    onHandled(request.id);
  }

  const initials = request.requester.username.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl animate-fade-in">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden flex-shrink-0">
        {request.requester.avatar_url ? (
          <img src={request.requester.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{request.requester.username}</p>
        <p className="text-xs text-gray-500">Sent you a friend request</p>
      </div>
      <div className="flex gap-2">
        <button
          id={`accept-friend-${request.id}`}
          onClick={accept}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          Accept
        </button>
        <button
          id={`reject-friend-${request.id}`}
          onClick={reject}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
