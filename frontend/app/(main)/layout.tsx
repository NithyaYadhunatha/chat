export const dynamic = 'force-dynamic';

import loadDynamic from 'next/dynamic';

// AppShell uses useStore, useWebSocket, axios — all browser-only.
// ssr:false ensures Next.js never tries to server-render this component tree.
const AppShell = loadDynamic(() => import('@/components/AppShell'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
