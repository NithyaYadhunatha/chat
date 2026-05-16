'use client';

import loadDynamic from 'next/dynamic';

// Disable SSR entirely — this page depends on browser APIs (Zustand, WebSocket)
// and must never be server-rendered. next/dynamic with ssr:false achieves this.
const ConversationClient = loadDynamic(
  () => import('@/components/chat/ConversationClient'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function ConversationPage() {
  return <ConversationClient />;
}
