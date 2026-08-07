import { WhatsappProviderKind } from '@prisma/client';

/**
 * La frontera entre WhatsFlow y quien transporta los mensajes.
 *
 * El MVP sale con Evolution API (vinculación por QR, no oficial) porque la
 * Cloud API de Meta exige verificación del negocio y aprobación previa, y eso no
 * puede bloquear el arranque del producto. La migración a Meta está decidida, no
 * es hipotética — así que la regla es dura: **ningún módulo fuera de
 * `whatsapp/providers` puede saber que Evolution existe.** Todo lo que el resto
 * del sistema necesita de un canal de WhatsApp está en esta interfaz, y el día
 * del cambio se implementa `MetaProvider` y se cambia una variable de entorno.
 *
 * Lo que NO entra aquí es tan importante como lo que entra: nada de `instanceName`,
 * `apikey`, `remoteJid`, `wamid` ni `phone_number_id`. Esos son vocabulario de un
 * proveedor concreto y viven dentro de su implementación; hacia fuera solo hay
 * `externalId` (identificador opaco de la sesión) y `credential` (secreto opaco).
 */
export interface WhatsAppProvider {
  /** Qué proveedor es. Se persiste en la instancia para saber por dónde salir. */
  readonly tipo: WhatsappProviderKind;

  /**
   * Si la vinculación se hace escaneando un QR (Evolution) o por un alta previa
   * fuera del panel (Meta). El panel usa esto para decidir qué enseñar, en vez
   * de preguntar por el nombre del proveedor — que sería volver a acoplarse.
   */
  readonly vinculaConQr: boolean;

  /**
   * Si hay credenciales para operar. Sin ellas el panel explica que falta
   * configurar el canal, en vez de fallar al pulsar "Conectar".
   */
  estaConfigurado(): boolean;

  /**
   * Da de alta una sesión nueva y devuelve lo necesario para vincularla.
   * `externalId` lo propone quien llama (lo genera a partir del tenant) para que
   * el webhook pueda resolver el tenant sin una consulta extra.
   */
  crearSesion(params: CrearSesionParams): Promise<SesionCreada>;

  /**
   * Vuelve a pedir el código de vinculación de una sesión existente (el QR
   * caduca en menos de un minuto). Devuelve null si el proveedor no vincula por
   * QR o si la sesión ya está conectada.
   */
  renovarVinculacion(params: SesionParams): Promise<string | null>;

  /** Consulta el estado real en el proveedor, sin fiarse de lo que hay en BD. */
  consultarEstado(params: SesionParams): Promise<EstadoRemoto>;

  /** Cierra la sesión y borra sus datos en el proveedor. Idempotente. */
  eliminarSesion(params: SesionParams): Promise<void>;

  /** Envía un mensaje de texto al cliente final. */
  enviarTexto(params: EnviarTextoParams): Promise<ResultadoEnvio>;

  /**
   * Traduce el cuerpo de un webhook del proveedor a eventos del dominio.
   *
   * Devuelve una lista porque un solo POST puede traer varios mensajes (Meta
   * agrupa por `entry`/`changes`). Los eventos que no interesan se descartan
   * aquí: quien llama no debería tener que reconocer basura ajena.
   */
  interpretarWebhook(cuerpo: unknown): EventoWhatsApp[];
}

/** Token de inyección: la interfaz es un tipo y no sobrevive a la compilación. */
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface CrearSesionParams {
  /** Identificador de sesión propuesto por WhatsFlow (opaco para el proveedor). */
  externalId: string;
  /** A dónde debe mandar el proveedor sus eventos. */
  webhookUrl: string;
  /** Cabeceras con las que el proveedor debe firmar cada webhook. */
  webhookHeaders: Record<string, string>;
}

export interface SesionParams {
  externalId: string;
  /** El secreto emitido al crear la sesión, ya descifrado. */
  credential: string | null;
}

export interface EnviarTextoParams extends SesionParams {
  /** Teléfono del destinatario en E.164, sin `+` ni sufijos del proveedor. */
  to: string;
  text: string;
}

export interface SesionCreada {
  /** Código de vinculación listo para pintar (data URI), si aplica. */
  codigoVinculacion: string | null;
  /** Secreto de la sesión, en claro. Quien llama lo cifra antes de guardarlo. */
  credential: string | null;
}

/** Estado de la sesión según el proveedor, ya traducido al vocabulario propio. */
export interface EstadoRemoto {
  conectado: boolean;
  /** Número vinculado en E.164, si el proveedor lo expone. */
  phoneNumber: string | null;
}

export interface ResultadoEnvio {
  /** ID del mensaje en el proveedor, para deduplicar el eco del webhook. */
  externalMessageId: string | null;
}

// ---------------------------------------------------------------------------
// Eventos del dominio
// ---------------------------------------------------------------------------

export type EventoWhatsApp = EventoMensaje | EventoEstadoSesion | EventoVinculacion;

/**
 * Un mensaje se cruzó entre el negocio y un cliente.
 *
 * Lleva dirección porque el proveedor también avisa de lo que sale: si el dueño
 * contesta desde el WhatsApp de su móvil, ese mensaje existe para el cliente y
 * tiene que existir en la bandeja. Sin esto el equipo lee media conversación y
 * vuelve a preguntar lo que el dueño ya respondió.
 */
export interface EventoMensaje {
  clase: 'mensaje';
  externalId: string;
  /** ID del mensaje en el proveedor: la clave de deduplicación. */
  externalMessageId: string;
  /** 'entrante' = lo escribió el cliente; 'saliente' = salió del negocio. */
  direccion: 'entrante' | 'saliente';
  /** Teléfono del CLIENTE en E.164, sea quien sea el que escribe. */
  contactPhone: string;
  /** Nombre que el cliente tiene puesto en WhatsApp, si viaja en el evento. */
  contactName: string | null;
  /** `text` es lo único que consume el MVP; el resto se registra y se ignora. */
  tipo: string;
  texto: string;
  enviadoEn: Date;
}

/** La sesión cambió de estado (se conectó, se cayó, la cerraron). */
export interface EventoEstadoSesion {
  clase: 'estado-sesion';
  externalId: string;
  conectado: boolean;
  /** El proveedor a veces revela el número justo al conectar. */
  phoneNumber: string | null;
  motivo: string | null;
}

/** Hay un código de vinculación nuevo (el anterior caducó sin escanearse). */
export interface EventoVinculacion {
  clase: 'vinculacion';
  externalId: string;
  codigoVinculacion: string;
}
