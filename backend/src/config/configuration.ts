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
    // Qué proveedor transporta los mensajes: 'evolution' (puente del MVP) o
    // 'meta' (Cloud API oficial). Cambiar esto es TODO lo que hará falta para
    // migrar — ver src/whatsapp/providers/whatsapp-provider.interface.ts.
    provider: string;
    verifyToken: string;
    accessToken: string;
    phoneNumberId: string;
    appSecret: string;
    apiBaseUrl: string;
    graphApiVersion: string;
  };
  evolution: {
    baseUrl: string;
    apiKey: string;
    // Origen público de ESTE backend: Evolution necesita una URL a la que llegar,
    // y en local no vale http://localhost (corre en otro contenedor o máquina).
    publicUrl: string;
    // Secreto que Evolution devuelve en cada webhook. Evolution no firma sus
    // payloads como Meta, así que este token compartido es lo único que separa
    // un evento legítimo de cualquiera que descubra la ruta. Ver SECURITY.md.
    webhookToken: string;
  };
  ai: {
    provider: string;
    apiKey: string;
    model: string;
    maxCallsPerConversationPerHour: number;
    // Techo por NEGOCIO además del de cada conversación: sin él, un cliente con
    // muchas conversaciones a la vez consume el saldo de toda la plataforma.
    maxCallsPerTenantPerHour: number;
    maxCallsPerTenantPerDay: number;
    // Proveedor alternativo compatible con la API de OpenAI, solo para probar el
    // agente sin créditos de Anthropic (`AI_PROVIDER=nvidia`). Temporal: el
    // agente de producción es Claude.
    nvidia: {
      apiKey: string;
      model: string;
      baseUrl: string;
    };
  };
  embeddings: {
    // 'voyage' (destino de producción) | 'nvidia' (real, gratuito) | 'mock' (tests)
    provider: string;
    apiKey: string;
    model: string;
    // Solo para proveedores compatibles con OpenAI (nvidia).
    baseUrl: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    // Redirect URI del login/registro con Google — distinto del de Calendar
    // (mismo cliente OAuth, dos URIs de redirección autorizadas en Google
    // Cloud Console, un scope mínimo para cada propósito).
    loginRedirectUri: string;
  };
  security: {
    tokenEncryptionKey: string;
  };
  frontend: {
    // Origen del panel para redirigir tras el callback de OAuth. Vacío = ruta
    // relativa (mismo origen que Nest en producción); en dev es http://localhost:5173.
    baseUrl: string;
  };
  business: {
    // Zona horaria en la que la IA interpreta y agenda ("America/Lima"). Vacío =
    // la del servidor. Es global, no por tenant: ver DECISIONS.md.
    timeZone: string;
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
    provider: process.env.WHATSAPP_PROVIDER ?? 'evolution',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    // Endpoint de la Meta Cloud API (envío saliente).
    apiBaseUrl: process.env.WHATSAPP_API_BASE_URL ?? 'https://graph.facebook.com',
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v21.0',
  },
  evolution: {
    baseUrl: process.env.EVOLUTION_API_URL ?? '',
    apiKey: process.env.EVOLUTION_API_KEY ?? '',
    // Se cae a la del panel solo como último recurso; en despliegue real son
    // orígenes distintos (el panel es estático, esto es la API).
    publicUrl: process.env.BACKEND_PUBLIC_URL ?? '',
    webhookToken: process.env.EVOLUTION_WEBHOOK_TOKEN ?? '',
  },
  ai: {
    // 'anthropic' (real) | 'nvidia' (real, gratuito, solo pruebas) | 'mock'
    provider: process.env.AI_PROVIDER ?? 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    // Modelo más económico de Anthropic por defecto (pruebas). Ver DECISIONS.md.
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
    maxCallsPerConversationPerHour: parseInt(
      process.env.AI_MAX_CALLS_PER_CONVERSATION_PER_HOUR ?? '20',
      10,
    ),
    maxCallsPerTenantPerHour: parseInt(process.env.AI_MAX_CALLS_PER_TENANT_PER_HOUR ?? '200', 10),
    maxCallsPerTenantPerDay: parseInt(process.env.AI_MAX_CALLS_PER_TENANT_PER_DAY ?? '1500', 10),
    nvidia: {
      apiKey: process.env.NVIDIA_API_KEY ?? '',
      // Verificado con tool-calling y respuestas en español; no todos los modelos
      // del catálogo de NVIDIA están aprovisionados ni soportan herramientas.
      model: process.env.NVIDIA_MODEL ?? 'nvidia/nvidia-nemotron-nano-9b-v2',
      baseUrl: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    },
  },
  embeddings: {
    provider: process.env.EMBEDDINGS_PROVIDER ?? 'mock',
    // Una sola variable para la credencial: cuál se usa depende del proveedor
    // activo, y así no hay dos claves compitiendo por el mismo campo.
    apiKey: process.env.EMBEDDINGS_API_KEY ?? process.env.VOYAGE_API_KEY ?? '',
    // Vacío = el modelo por defecto de cada proveedor (ver EmbeddingsService).
    model: process.env.EMBEDDINGS_MODEL ?? '',
    baseUrl: process.env.EMBEDDINGS_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
    loginRedirectUri: process.env.GOOGLE_LOGIN_REDIRECT_URI ?? '',
  },
  security: {
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  },
  frontend: {
    baseUrl: process.env.FRONTEND_BASE_URL ?? '',
  },
  business: {
    timeZone: process.env.BUSINESS_TIME_ZONE ?? '',
  },
});
