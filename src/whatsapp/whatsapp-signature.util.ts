import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifica la firma `X-Hub-Signature-256` que Meta envía en cada webhook POST.
 * Calcula HMAC-SHA256 del cuerpo crudo con el App Secret y lo compara en tiempo
 * constante. Requisito de seguridad (SECURITY.md): no confiar en webhooks sin
 * validar su origen.
 *
 * @param rawBody cuerpo crudo de la petición (bytes exactos recibidos)
 * @param signatureHeader valor del header, con formato "sha256=<hex>"
 * @param appSecret App Secret de la app de Meta
 */
export function verifyWhatsAppSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signatureHeader || !appSecret) {
    return false;
  }
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');

  // timingSafeEqual exige buffers de igual longitud.
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, receivedBuf);
}
