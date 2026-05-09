'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore, ConversationOut } from '@/lib/store';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

function ConversationItem({ conv }: { conv: ConversationOut }) {
  const pathname = usePathname();
  const isActive = pathname === `/conversations/${conv.id}`;
  const { unreadCounts } = useStore();
  const unread = unreadCounts[conv.id] ?? conv.unread_count;

  const lastMsgPreview = conv.last_message?.content ?? 'No messages yet';
  const timeAgo = conv.last_message
    ? formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: false })
    : '';
  const initials = conv.other_user.username.slice(0, 2).toUpperCase();

  return (
    <Link href={`/conversations/${conv.id}`}>
      <div
        className={`flex items-center gap-3 px-3 py-3 rounded-xl mx-2 cursor-pointer transition-all duration-150 ${
          isActive
            ? 'bg-indigo-600/15 border border-indigo-500/20'
            : 'hover:bg-gray-800/70 border border-transparent'
        }`}
      >
        {/* Avatar with online dot */}
        <div className="relative flex-shrink-0">
          <Avatar className="w-10 h-10">
            <AvatarImage src={conv.other_user.avatar_url ?? undefined} alt={conv.other_user.username} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
              conv.other_user.is_online ? 'bg-emerald-400' : 'bg-gray-600'
            }`}
          />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-200'}`}>
              {conv.other_user.username}
            </span>
            <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo}</span>
          </div>
          <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-gray-300 font-medium' : 'text-gray-500'}`}>
            {lastMsgPreview}
          </p>
        </div>

        {/* Unread badge */}
        {unread > 0 && (
          <Badge className="flex-shrink-0 bg-indigo-500 text-white border-0 text-[10px] min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full">
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </div>
    </Link>
  );
}

export default function ConversationList() {
  const { conversations } = useStore();

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center px-4">
        <p className="text-sm text-gray-500">No conversations yet</p>
        <p className="text-xs text-gray-600 mt-1">Add a friend and start chatting!</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-2 space-y-0.5">
        <p className="px-5 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Messages
        </p>
        {conversations.map((conv) => (
          <ConversationItem key={conv.id} conv={conv} />
        ))}
      </div>
    </ScrollArea>
  );
}
