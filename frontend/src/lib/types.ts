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
  /** Resumen para el equipo (distinto de la memoria interna de la IA). */
  summary: string | null;
  summaryAt: string | null;
  /** Llegaron mensajes después de generarlo: lo que dice puede haber cambiado. */
  summaryStale: boolean;
}

/** Respuesta de POST /conversations/:id/summary. */
export interface ConversationSummaryResult {
  summary: string | null;
  summaryAt: string | null;
  summaryStale: boolean;
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

/** Consumo real de la IA del negocio en el período. Tokens, no dinero. */
export interface AiUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  byPurpose: Array<{ purpose: string; calls: number; inputTokens: number; outputTokens: number }>;
}

export interface BusinessProfile {
  businessHours: string | null;
  services: string | null;
  policies: string | null;
  tone: string | null;
  customInstructions: string | null;
  /** Zona IANA elegida por el negocio; null = se usa la del servidor. */
  timeZone: string | null;
  updatedAt: string | null;
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

export type KnowledgeDocumentStatus =
  | 'EXTRACTING'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'FAILED';

export type KnowledgeExtractionMethod = 'TEXT_LAYER' | 'VISION';

export interface KnowledgeDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KnowledgeDocumentStatus;
  extractionMethod: KnowledgeExtractionMethod | null;
  pageCount: number | null;
  charCount: number | null;
  visionTokensUsed: number;
  extractionError: string | null;
  createdAt: string;
}

export interface KnowledgeUploadResult extends KnowledgeDocument {
  preview: string;
  previewTruncated: boolean;
}

export interface AiContextPreview {
  prompt: string;
  sampleQuery: string;
  tokens: number;
  /** true = estimación local (sin API key); se muestra como aproximado. */
  tokensEstimated: boolean;
  knowledgeChunksUsed: number;
  documents: Array<{ filename: string; charCount: number }>;
}

/** Producto del catálogo. El precio va en céntimos: en dinero, el float redondea mal. */
export interface Product {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string | null;
  stock: number;
  active: boolean;
}

/** Resultado de importar un CSV de productos, con los errores por fila. */
export interface ImportReport {
  created: number;
  updated: number;
  errors: Array<{ row: number; reason: string }>;
}

/** Herramienta que el agente habría usado en el chat de prueba (no se ejecutó). */
export interface SimulatedTool {
  name: string;
  input: Record<string, unknown>;
}

/** Respuesta del chat de prueba del panel. */
export interface TestChatReply {
  text: string;
  simulatedTools: SimulatedTool[];
}
