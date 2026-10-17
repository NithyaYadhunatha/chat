'use client';

import { create } from 'zustand';
import { api, refreshSession, setAccessToken } from './api';
import type { Me } from './types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: Status;
  me: Me | null;
  bootstrap: () => Promise<void>;
  signIn: (accessToken: string) => Promise<Me>;
  signOut: () => Promise<void>;
  reloadMe: () => Promise<Me | null>;
  setMe: (me: Me) => void;
}

let booting: Promise<void> | null = null;

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  me: null,

  bootstrap: () => {
    if (get().status !== 'loading') return Promise.resolve();
    booting ??= (async () => {
      const token = await refreshSession();
      if (!token) {
        set({ status: 'anonymous', me: null });
        return;
      }
      try {
        const me = await api<Me>('/users/me');
        set({ status: 'authenticated', me });
      } catch {
        set({ status: 'anonymous', me: null });
      }
    })().finally(() => {
      booting = null;
    });
    return booting;
  },

  signIn: async (accessToken) => {
    setAccessToken(accessToken);
    const me = await api<Me>('/users/me');
    set({ status: 'authenticated', me });
    return me;
  },

  signOut: async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Signing out locally is what matters.
    }
    setAccessToken(null);
    set({ status: 'anonymous', me: null });
  },

  reloadMe: async () => {
    try {
      const me = await api<Me>('/users/me');
      set({ me });
      return me;
    } catch {
      return null;
    }
  },

  setMe: (me) => set({ me }),
}));
