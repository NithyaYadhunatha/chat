export type Role = 'user' | 'moderator' | 'admin';

export interface ChatBan {
  banned: boolean;
  until: string | null;
  permanent: boolean;
  reason: string | null;
  age_review: boolean;
}

export interface Me {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  auth_provider: string;
  has_password: boolean;
  interests: string[];
  birth_date: string | null;
  needs_onboarding: boolean;
  created_at: string;
  chat_ban: ChatBan;
}

export interface PublicUser {
  id: string;
  username: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
}

export interface Friend extends PublicUser {
  friendship_id: string;
}

export interface FriendRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  user: PublicUser;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  edited?: boolean;
  deleted?: boolean;
  reactions?: { user_id: string; emoji: string }[];
  reply_to?: { id: string; sender_id: string | null; content: string; deleted: boolean } | null;
  pending?: boolean;
  failed?: string;
}

export interface Conversation {
  id: string;
  other_user: PublicUser;
  last_message: { id: string; sender_id: string; content: string; created_at: string } | null;
  unread_count: number;
  updated_at: string;
  can_message: boolean;
}

export type ReportReason = 'sexual' | 'minor' | 'harassment' | 'threats' | 'self_harm' | 'spam' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'sexual', label: 'Sexual content', hint: 'Sexual messages, requests for photos, solicitation' },
  { value: 'minor', label: 'May be under 18', hint: 'Said or implied they are a minor' },
  { value: 'harassment', label: 'Harassment or hate', hint: 'Abuse, slurs, bullying' },
  { value: 'threats', label: 'Threats or doxxing', hint: 'Threats of violence, sharing personal info' },
  { value: 'self_harm', label: 'Self-harm', hint: 'Encouraging someone to hurt themselves' },
  { value: 'spam', label: 'Spam or scam', hint: 'Ads, links, money requests, bots' },
  { value: 'other', label: 'Something else', hint: '' },
];
