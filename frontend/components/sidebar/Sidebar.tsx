'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import api from '@/lib/api';
import ConversationList from './ConversationList';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

const navItems = [
  {
    href: '/conversations',
    label: 'Chats',
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 transition-colors ${active ? 'text-indigo-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
      </svg>
    ),
  },
  {
    href: '/friends',
    label: 'Friends',
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 transition-colors ${active ? 'text-indigo-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.768-.231-1.48-.634-2.072M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.768.231-1.48.634-2.072M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 transition-colors ${active ? 'text-indigo-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

// Stranger nav item (separate, bottom section)
const strangerNavItem = {
  href: '/stranger',
  label: 'Stranger',
  icon: (active: boolean) => (
    <svg className={`w-5 h-5 transition-colors ${active ? 'text-violet-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
    </svg>
  ),
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, unreadCounts, strangerOnlineCount, strangerState } = useStore();

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const initials = currentUser?.username?.slice(0, 2).toUpperCase() ?? '??';

  async function handleLogout() {
    await api.post('/auth/logout');
    useStore.getState().setAccessToken(null);
    useStore.getState().setCurrentUser(null);
    router.push('/login');
  }

  const strangerActive = pathname.startsWith('/stranger');

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-72 bg-gray-900 border-r border-gray-800 h-full">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="relative flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-full">
                <Avatar className="w-9 h-9 ring-2 ring-gray-700 hover:ring-indigo-500 transition-all">
                  <AvatarImage src={currentUser?.avatar_url ?? undefined} alt={currentUser?.username} />
                  <AvatarFallback className="bg-indigo-700 text-white text-xs font-bold">{initials}</AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-gray-900" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-gray-800 border-gray-700 text-gray-100">
              <DropdownMenuItem onClick={() => router.push('/profile')} className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-700" />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-400 hover:bg-gray-700 hover:text-red-300 focus:bg-gray-700 focus:text-red-300">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{currentUser?.username}</p>
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Online
            </p>
          </div>
        </div>

        {/* Nav tabs — Friends section */}
        <nav className="flex gap-1 px-3 py-2 border-b border-gray-800">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger>
                  <Link
                    href={item.href}
                    className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                      active ? 'bg-indigo-600/15 text-indigo-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {item.icon(active)}
                    <span className="text-[10px]">{item.label}</span>
                    {item.href === '/conversations' && totalUnread > 0 && (
                      <Badge className="absolute -top-1 -right-1 w-4 h-4 p-0 flex items-center justify-center text-[9px] bg-indigo-500 text-white border-0">
                        {totalUnread > 9 ? '9+' : totalUnread}
                      </Badge>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-gray-800 text-gray-100 border-gray-700 text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Conversation list content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {pathname.startsWith('/conversations') && <ConversationList />}
          {pathname.startsWith('/friends') && (
            <div className="px-5 py-4 text-xs text-gray-500">Head to the Friends tab above to manage friends.</div>
          )}
        </div>

        {/* ── Stranger Chat Section (bottom) ── */}
        <div className="flex-shrink-0 border-t border-gray-800 p-3">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-1 mb-2">Stranger Chat</p>
          <Link
            href="/stranger"
            id="stranger-sidebar-btn"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${
              strangerActive
                ? 'bg-violet-600/15 border border-violet-500/20'
                : 'hover:bg-gray-800/70 border border-transparent'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
              strangerActive ? 'bg-violet-600/30' : 'bg-gray-800 group-hover:bg-gray-700'
            }`}>
              {strangerNavItem.icon(strangerActive)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium transition-colors ${strangerActive ? 'text-violet-300' : 'text-gray-400 group-hover:text-gray-200'}`}>
                Chat with a Stranger
              </p>
              {strangerState === 'waiting' ? (
                <p className="text-xs text-violet-400 font-medium">Looking for someone…</p>
              ) : strangerState === 'chatting' ? (
                <p className="text-xs text-emerald-400 font-medium">● In session</p>
              ) : strangerOnlineCount > 0 ? (
                <p className="text-xs text-gray-500">{strangerOnlineCount} online now</p>
              ) : (
                <p className="text-xs text-gray-600">Tap to start</p>
              )}
            </div>
            {strangerState === 'chatting' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            )}
            {strangerState === 'waiting' && (
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
            )}
          </Link>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-gray-900 border-t border-gray-800 pb-safe">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium transition-colors ${
                active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {item.icon(active)}
              {item.label}
              {item.href === '/conversations' && totalUnread > 0 && (
                <span className="absolute top-2 left-1/2 ml-2 w-4 h-4 flex items-center justify-center rounded-full bg-indigo-500 text-white text-[9px] font-bold">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </Link>
          );
        })}
        {/* Stranger in mobile nav */}
        <Link
          href="/stranger"
          className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium transition-colors ${
            strangerActive ? 'text-violet-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {strangerNavItem.icon(strangerActive)}
          Stranger
          {strangerState === 'chatting' && (
            <span className="absolute top-2 left-1/2 ml-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </Link>
      </nav>
    </>
  );
}
