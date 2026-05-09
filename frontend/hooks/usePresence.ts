'use client';

import { useStore } from '@/lib/store';

export function usePresence(userId: string): boolean {
  const onlineUsers = useStore((s) => s.onlineUsers);
  return onlineUsers.has(String(userId));
}
