/**
 * Configuración tipada de la aplicación, cargada desde variables de entorno.
 * Se valida en el arranque (ver validation.ts) para fallar temprano si falta algo.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  whatsapp: {
    verifyToken: string;
    accessToken: string;
    phoneNumberId: string;
    appSecret: string;
    apiBaseUrl: string;
    graphApiVersion: string;
  };
  ai: {
    provider: string;
    apiKey: string;
    model: string;
    maxCallsPerConversationPerHour: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    // Endpoint de la Meta Cloud API (envío saliente).
    apiBaseUrl: process.env.WHATSAPP_API_BASE_URL ?? 'https://graph.facebook.com',
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v21.0',
  },
  ai: {
    // 'anthropic' (real) | 'mock' (pruebas locales sin gastar créditos)
    provider: process.env.AI_PROVIDER ?? 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    // Modelo más económico de Anthropic por defecto (pruebas). Ver DECISIONS.md.
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
    maxCallsPerConversationPerHour: parseInt(
      process.env.AI_MAX_CALLS_PER_CONVERSATION_PER_HOUR ?? '20',
      10,
    ),
  },
});
