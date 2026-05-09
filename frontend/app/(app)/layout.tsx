'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/lib/api';
import Sidebar from '@/components/sidebar/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, setCurrentUser, setAccessToken, setConversations } = useStore();
  const router = useRouter();

  // Bootstrap: refresh token → access token → load user + conversations
  useEffect(() => {
    async function bootstrap() {
      try {
        const { data: tokenData } = await api.post('/auth/refresh', {});
        setAccessToken(tokenData.access_token);
        const { data: me } = await api.get('/users/me');
        setCurrentUser(me);
        const { data: convs } = await api.get('/conversations');
        setConversations(convs);
      } catch {
        router.push('/login');
      }
    }
    if (!currentUser) {
      bootstrap();
    }
  }, []);

  // WebSocket — active once user is loaded
  useWebSocket();

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
