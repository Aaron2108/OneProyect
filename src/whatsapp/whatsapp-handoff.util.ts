/**
 * Detección de solicitud de atención humana (RF-11, disparador por palabra clave).
 * Si el cliente pide hablar con una persona, la conversación se pasa a un humano
 * y la IA deja de responder automáticamente.
 *
 * Heurística deliberadamente conservadora para el MVP: cubre las formas más
 * comunes en español sin arriesgar falsos positivos. Un clasificador por IA
 * (baja confianza → escalar) se puede añadir después.
 */
const HUMAN_REQUEST_PATTERNS: RegExp[] = [
  /\b(hablar|habla|comunicar|comunicarme|contactar)\s+con\s+(una?\s+)?(persona|humano|humana|agente|asesor|asesora|ejecutivo|ejecutiva|operador|operadora|alguien|un\s+representante|representante)\b/i,
  /\b(quiero|necesito|dame|pás[ae]me|me\s+pasas?|puedo\s+hablar\s+con)\s+.*(persona|humano|humana|agente|asesor|asesora|representante|operador)\b/i,
  /\b(atención|atienda|atiende|atender)\s+(un[ao]?\s+)?(persona|humano|humana|agente|asesor)\b/i,
  /\b(agente|asesor|humano)\s+real\b/i,
];

export function requestsHumanAgent(text: string): boolean {
  if (!text) {
    return false;
  }
  return HUMAN_REQUEST_PATTERNS.some((re) => re.test(text));
}
