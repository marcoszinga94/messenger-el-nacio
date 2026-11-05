export type UserRole = 'student' | 'admin';

export type UserStatus = 'online' | 'away' | 'busy' | 'invisible' | 'offline';

export type EffectiveStatus = Exclude<UserStatus, 'invisible'>;

export type ContactState = 'pending' | 'accepted' | 'blocked';

export type ConversationType = 'dm' | 'group';

export type MessageKind = 'text' | 'system' | 'nudge';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  status: EffectiveStatus;
  statusMessage: string;
  lastSeen: number | null;
  role?: UserRole;
}

export interface Me extends Omit<PublicUser, 'status'> {
  status: UserStatus;
  role: UserRole;
  createdAt: number;
}

export interface AuthResponse {
  user: Me;
  accessToken: string;
  refreshToken: string;
}

export interface ContactEntry {
  user: PublicUser;
  nickname: string | null;
  state: ContactState;
  direction: 'incoming' | 'outgoing' | 'mutual';
  createdAt: number;
}

export interface SearchResult {
  user: PublicUser;
  relation: ContactState | 'none' | 'self';
  direction: 'incoming' | 'outgoing' | 'mutual' | null;
}

export interface ConversationMember {
  user: PublicUser;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: PublicUser | null;
  kind: MessageKind;
  body: string;
  createdAt: number;
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  name: string | null;
  topic: string;
  avatar: string | null;
  course: string;
  isOfficial: boolean;
  createdBy: string | null;
  createdAt: number;
  members: ConversationMember[];
  lastMessage: Message | null;
  unread: number;
  muted: boolean;
  lastReadAt: number;
}

export interface AdminStats {
  users: number;
  online: number;
  conversations: number;
  messagesToday: number;
  messagesTotal: number;
  invitesActive: number;
}

export interface Invite {
  code: string;
  course: string;
  maxUses: number;
  uses: number;
  expiresAt: number | null;
  createdAt: number;
  revoked: boolean;
  createdBy: string | null;
}

export interface AdminSettings {
  retentionDays: number;
  registrationEnabled: boolean;
  maxGroupSize: number;
  appName: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: number;
}
