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
  /** Hay cuenta guardada pero sus credenciales ya no sirven: hay que reconectar. */
  needsReconnect: boolean;
  /** Citas cuya sincronización falló y sigue reintentándose. */
  pendingSyncCount: number;
  /** Último error de sincronización que reportó el servidor. */
  lastSyncError: string | null;
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
  /**
   * Cuánto se tarda en contestar a un cliente, medido por turnos (el hueco
   * entre un mensaje entrante y el saliente que va justo detrás).
   *
   * La cifra que se enseña es la MEDIANA, no la media: una sola respuesta
   * nocturna de diez horas arrastra la media de todo el período y deja de
   * describir a ninguna de las respuestas reales. Todo puede ser `null` —sin
   * pareja entrante→saliente en el período no hay nada que medir, y un 0 se
   * leería como "se contesta al instante".
   *
   * Opcional a propósito: es un bloque que se añadió después, y un backend
   * anterior al cambio no lo manda. El panel se despliega por su cuenta, así
   * que ese desfase existe de verdad; si el tipo lo diera por seguro, la
   * pantalla entera se caería por una sección de apoyo.
   */
  responseTime?: {
    samples: number;
    medianSeconds: number | null;
    averageSeconds: number | null;
    aiSamples: number;
    aiMedianSeconds: number | null;
    humanSamples: number;
    humanMedianSeconds: number | null;
  };
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
  /** Modelo que atiende al agente, p. ej. `claude-haiku-4-5`. */
  model: string;
  /** `anthropic` | `nvidia` | `mock`. En `mock` las respuestas son simuladas. */
  provider: string;
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

/** Estado del vínculo con WhatsApp, tal como lo cuenta el backend. */
export type WhatsappConnectionStatus =
  | 'DISCONNECTED'
  | 'QR_PENDING'
  | 'CONNECTED'
  | 'ERROR';

/**
 * El canal de WhatsApp del negocio.
 *
 * No dice qué proveedor hay debajo más allá de `vinculaConQr`, y es a propósito:
 * la pantalla se escribe una sola vez y sigue valiendo cuando la plataforma
 * migre a la API oficial de Meta.
 */
export interface ChannelStatus {
  /** Si el servidor tiene credenciales para operar el canal. */
  configurado: boolean;
  /** Si vincular consiste en escanear un QR. */
  vinculaConQr: boolean;
  provider: 'EVOLUTION' | 'META';
  status: WhatsappConnectionStatus;
  /** Número del negocio ya vinculado, en E.164. */
  phoneNumber: string | null;
  /** QR listo para pintar (data URI). Solo llega mientras hay vinculación viva. */
  qrCode: string | null;
  qrExpiresAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
}

/** Lo que el backend avisa por el canal de tiempo real. */
export type EventoPanel =
  | { tipo: 'mensaje'; conversationId: string; direccion: 'entrante' | 'saliente' }
  | { tipo: 'conversacion'; conversationId: string; nueva: boolean }
  | { tipo: 'canal'; status: WhatsappConnectionStatus };
