import {
  EventoWhatsApp,
  EventoMensaje,
} from './whatsapp-provider.interface';
import {
  EvolutionConnectionData,
  EvolutionMessageData,
  EvolutionQrData,
  EvolutionWebhookBody,
} from './evolution.types';

/**
 * Traducción del webhook de Evolution a eventos del dominio.
 *
 * Funciones puras y sin dependencias de Nest a propósito: esto es lo único que
 * de verdad hay que blindar con tests (un payload real es difícil de reproducir
 * a mano, y equivocarse aquí mete mensajes en la conversación equivocada).
 */

/** JID de un chat de grupo. El MVP atiende conversaciones 1 a 1. */
const SUFIJO_GRUPO = '@g.us';
/** Los "estados" de WhatsApp llegan por el mismo canal y no son conversación. */
const JID_ESTADOS = 'status@broadcast';

/**
 * Extrae el teléfono de un JID de Baileys.
 *
 * Formas conocidas: "51987654321@s.whatsapp.net", "51987654321:12@s.whatsapp.net"
 * (con sufijo de dispositivo) y "51987654321@lid". Devuelve solo los dígitos,
 * que es como se guarda el teléfono en `Contact.phone` — el mismo formato que
 * usa la Cloud API de Meta, así que el día del cambio de proveedor los contactos
 * ya existentes siguen casando.
 */
export function telefonoDesdeJid(jid: string | undefined): string | null {
  if (!jid) return null;
  const usuario = jid.split('@')[0] ?? '';
  // ":12" es el índice del dispositivo dentro de la misma cuenta, no parte del número.
  const soloDigitos = (usuario.split(':')[0] ?? '').replace(/\D/g, '');
  return soloDigitos.length > 0 ? soloDigitos : null;
}

/** true si el chat no es una conversación 1 a 1 con un cliente. */
export function esChatIgnorable(jid: string | undefined): boolean {
  if (!jid) return true;
  return jid === JID_ESTADOS || jid.endsWith(SUFIJO_GRUPO);
}

/**
 * Texto del mensaje, venga en el campo que venga.
 *
 * Un mensaje simple llega en `conversation`; uno con formato, respuesta o enlace
 * llega en `extendedTextMessage.text`. Las imágenes y documentos traen su pie de
 * foto: se aprovecha, porque un cliente que manda una foto con "¿tienen este
 * modelo?" está preguntando algo, y dejar la burbuja vacía en la bandeja
 * esconde justo la parte que hay que leer.
 */
export function textoDelMensaje(mensaje: EvolutionMessageData['message']): string {
  if (!mensaje) return '';
  return (
    mensaje.conversation ??
    mensaje.extendedTextMessage?.text ??
    mensaje.imageMessage?.caption ??
    mensaje.videoMessage?.caption ??
    mensaje.documentMessage?.caption ??
    ''
  );
}

/**
 * Qué clase de contenido es, para guardarlo en `Message.type`.
 *
 * Se normaliza a las mismas etiquetas que usa la Cloud API de Meta ("text",
 * "image", "audio"…) y no a las de Baileys ("imageMessage"): así el histórico no
 * queda partido en dos vocabularios cuando se cambie de proveedor.
 */
export function tipoDelMensaje(data: EvolutionMessageData): string {
  const mensaje = data.message;
  if (!mensaje) return 'text';
  if (mensaje.conversation !== undefined || mensaje.extendedTextMessage !== undefined) {
    return 'text';
  }
  if (mensaje.imageMessage) return 'image';
  if (mensaje.videoMessage) return 'video';
  if (mensaje.audioMessage) return 'audio';
  if (mensaje.documentMessage) return 'document';
  return data.messageType ?? 'text';
}

/** El timestamp de Baileys viene en segundos epoch. */
export function fechaDelMensaje(timestamp: number | string | undefined): Date {
  const segundos = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  if (segundos === undefined || !Number.isFinite(segundos) || segundos <= 0) {
    return new Date();
  }
  return new Date(segundos * 1000);
}

/**
 * `messages.upsert` → evento de mensaje, o null si no hay nada que guardar.
 *
 * Evolution manda `data` como objeto o como lista según la versión y el origen
 * del evento; quien llama ya ha desenvuelto ese caso.
 */
export function interpretarMensaje(
  externalId: string,
  data: EvolutionMessageData,
): EventoMensaje | null {
  const jid = data.key?.remoteJid;
  if (esChatIgnorable(jid)) return null;

  const contactPhone = telefonoDesdeJid(jid);
  const externalMessageId = data.key?.id;
  if (!contactPhone || !externalMessageId) return null;

  const texto = textoDelMensaje(data.message);
  // Sin texto no hay nada que enseñar en la bandeja (sticker, ubicación, un
  // audio suelto). Se descarta en vez de guardar una burbuja vacía que el
  // equipo no puede interpretar; el soporte de adjuntos es trabajo aparte.
  if (texto.trim().length === 0) return null;

  const fromMe = data.key?.fromMe === true;

  return {
    clase: 'mensaje',
    externalId,
    externalMessageId,
    direccion: fromMe ? 'saliente' : 'entrante',
    contactPhone,
    // `pushName` es el nombre que el CLIENTE tiene puesto. En un mensaje que
    // sale del negocio, ese campo trae el nombre del propio negocio: usarlo
    // renombraría al contacto con el nombre de la empresa.
    contactName: fromMe ? null : (data.pushName ?? null),
    tipo: tipoDelMensaje(data),
    texto,
    enviadoEn: fechaDelMensaje(data.messageTimestamp),
  };
}

/**
 * Cuerpo completo del webhook → lista de eventos del dominio.
 *
 * Nunca lanza: un webhook con una forma inesperada se traduce a "ningún evento".
 * El proveedor reintenta lo que no responde 2xx, así que fallar aquí convertiría
 * un payload raro en un bucle de reintentos.
 */
export function interpretarWebhookEvolution(cuerpo: unknown): EventoWhatsApp[] {
  if (!cuerpo || typeof cuerpo !== 'object') return [];
  const body = cuerpo as EvolutionWebhookBody;

  const externalId = body.instance;
  const evento = body.event;
  if (!externalId || !evento) return [];

  // Evolution emite el nombre en minúsculas con puntos ("messages.upsert") pero
  // lo configura en mayúsculas con guiones bajos ("MESSAGES_UPSERT"). Se
  // normaliza para no depender de cuál de las dos formas llegue.
  const clave = evento.replace(/[.-]/g, '_').toUpperCase();

  switch (clave) {
    case 'MESSAGES_UPSERT':
    case 'SEND_MESSAGE': {
      // `data` puede ser un mensaje o una lista de mensajes según la versión.
      const bruto = body.data;
      const mensajes = Array.isArray(bruto) ? bruto : [bruto];
      return mensajes
        .map((m) => interpretarMensaje(externalId, (m ?? {}) as EvolutionMessageData))
        .filter((e): e is EventoMensaje => e !== null);
    }

    case 'CONNECTION_UPDATE': {
      const data = (body.data ?? {}) as EvolutionConnectionData;
      const estado = (data.state ?? '').toLowerCase();
      // Solo "open" y "close" son transiciones firmes. "connecting" es ruido de
      // paso: tomarlo por una desconexión haría parpadear el panel a rojo en
      // cada reintento interno del proveedor.
      if (estado !== 'open' && estado !== 'close') return [];
      return [
        {
          clase: 'estado-sesion',
          externalId,
          conectado: estado === 'open',
          phoneNumber: telefonoDesdeJid(data.wuid ?? body.sender),
          motivo: data.statusReason != null ? String(data.statusReason) : null,
        },
      ];
    }

    case 'QRCODE_UPDATED': {
      const data = (body.data ?? {}) as EvolutionQrData;
      const codigo = data.qrcode?.base64 ?? data.base64;
      if (!codigo) return [];
      return [{ clase: 'vinculacion', externalId, codigoVinculacion: codigo }];
    }

    case 'LOGOUT_INSTANCE':
      return [
        {
          clase: 'estado-sesion',
          externalId,
          conectado: false,
          phoneNumber: null,
          motivo: 'La sesión se cerró desde WhatsApp',
        },
      ];

    default:
      // Evolution emite decenas de eventos (presencia, contactos, grupos…). El
      // MVP solo alimenta la bandeja; el resto se descarta sin ruido.
      return [];
  }
}
