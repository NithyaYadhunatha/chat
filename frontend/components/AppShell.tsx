'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/lib/api';
import Sidebar from '@/components/sidebar/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, setCurrentUser, setAccessToken, setConversations } = useStore();
  const router = useRouter();

  // Bootstrap: refresh token → access token → load user + conversations
  useEffect(() => {
    async function bootstrap() {
      try {
        const refresh = localStorage.getItem('refresh_token');
        if (!refresh) throw new Error('No refresh token');
        const { data: tokenData } = await api.post('/auth/refresh', { refresh_token: refresh });
        setAccessToken(tokenData.access_token);
        if (tokenData.refresh_token) {
          localStorage.setItem('refresh_token', tokenData.refresh_token);
        }
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
