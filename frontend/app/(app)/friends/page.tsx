import { redirect } from 'next/navigation';

// Friends now live in the Chats tab.
export default function FriendsPage() {
  redirect('/messages');
}
