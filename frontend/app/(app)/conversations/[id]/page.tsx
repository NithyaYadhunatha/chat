'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import ChatWindow from '@/components/chat/ChatWindow';
import { useStore } from '@/lib/store';

export default function ConversationPage() {
  const params = useParams();
  const id = params.id as string; // MongoDB ObjectID string
  const { conversations } = useStore();
  const [otherUser, setOtherUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setOtherUser(conv.other_user);
      setLoading(false);
    } else {
      // Fallback: fetch from API
      api.get('/conversations').then(({ data }) => {
        const found = data.find((c: any) => c.id === id);
        if (found) {
          useStore.getState().setConversations(data);
          setOtherUser(found.other_user);
        }
        setLoading(false);
      });
    }
  }, [id, conversations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!otherUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Conversation not found.</p>
      </div>
    );
  }

  return <ChatWindow conversationId={id} otherUser={otherUser} />;
}
