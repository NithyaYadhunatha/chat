'use client';

import { useStore } from '@/lib/store';

export function usePresence(userId: number): boolean {
  const onlineUsers = useStore((s) => s.onlineUsers);
  return onlineUsers.has(userId);
}
