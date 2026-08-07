import { WhatsappConnectionStatus, WhatsappProviderKind } from '@prisma/client';

/**
 * Lo que el panel sabe del canal de WhatsApp.
 *
 * Deliberadamente no expone `externalId` ni la credencial: son datos internos
 * del proveedor y el panel no tiene nada que hacer con ellos. Tampoco expone
 * qué proveedor es más allá de `provider`/`vinculaConQr`, para que la sección
 * "Canales" no tenga ramas por proveedor.
 */
export class ChannelStatusDto {
  /** Si el servidor tiene credenciales para operar el canal. */
  configurado!: boolean;

  /** Si la vinculación se hace escaneando un QR (Evolution) o no (Meta). */
  vinculaConQr!: boolean;

  provider!: WhatsappProviderKind;

  status!: WhatsappConnectionStatus;

  /** Número del negocio ya vinculado, en E.164. Null mientras no haya sesión. */
  phoneNumber!: string | null;

  /**
   * QR listo para pintar (data URI). Solo viaja mientras `status` es
   * `QR_PENDING`: es una credencial de vinculación de vida corta, no un dato
   * del negocio, y no tiene por qué aparecer en ninguna otra respuesta.
   */
  qrCode!: string | null;

  /** Cuándo deja de servir el QR actual, para que el panel pida otro a tiempo. */
  qrExpiresAt!: string | null;

  /** Último fallo del proveedor, para poder explicar un ERROR en el panel. */
  lastError!: string | null;

  connectedAt!: string | null;
}
