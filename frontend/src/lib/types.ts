/** Tipos del dominio, espejo de los DTOs/entidades del backend (NestJS/Prisma). */

export type UserRole = 'OWNER' | 'AGENT';
export type ConversationStatus = 'OPEN' | 'CLOSED';
export type ConversationHandler = 'AI' | 'HUMAN';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageSender = 'CONTACT' | 'AI' | 'HUMAN';
export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

export interface Contact {
  id: string;
  tenantId: string;
  phone: string;
  name: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  sender: MessageSender;
  type: string;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  status: ConversationStatus;
  handledBy: ConversationHandler;
  unreadCount: number;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  contact: { id: string; name: string | null; phone: string };
}

export interface ConversationDetail extends ConversationSummary {
  contact: Contact;
  messages: Message[];
  _count: { notes: number };
}

export interface ConversationNote {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface QuickReply {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Appointment {
  id: string;
  contactId: string;
  title: string;
  scheduledAt: string;
  status: AppointmentStatus;
  notes: string | null;
  googleEventId: string | null;
  createdAt: string;
  contact: { id: string; name: string | null; phone: string };
}

export interface GoogleCalendarStatus {
  connected: boolean;
  googleAccountEmail: string | null;
  connectedAt: string | null;
}

export interface ActivityPoint {
  date: string;
  inbound: number;
  outbound: number;
}

export interface MetricsOverview {
  conversations: { total: number; open: number; closed: number; handledByAi: number; handledByHuman: number };
  messages: { total: number; inbound: number; outbound: number; fromContact: number; fromAi: number; fromHuman: number };
  contacts: { total: number };
  appointments: { total: number; scheduled: number; confirmed: number; cancelled: number; completed: number };
  reminders: { total: number; pending: number; sent: number; cancelled: number };
  automationRate: number;
  activity: ActivityPoint[];
}
