/**
 * Persistencia de la conversación de prueba del agente.
 *
 * Se guarda en `sessionStorage` porque cada sección es una ruta y salir de
 * "Agente IA" desmonta la pantalla: sin esto, ir a Productos y volver borraba lo
 * conversado. `sessionStorage` y no `localStorage` a propósito — es una prueba,
 * no algo que deba seguir ahí mañana: vive mientras la pestaña esté abierta.
 *
 * La clave lleva versión: si algún día cambia la forma de un turno, lo viejo se
 * descarta solo en vez de reventar al leerlo.
 */

import type { SimulatedTool } from '@/lib/types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  simulatedTools?: SimulatedTool[];
}

const CLAVE_CHAT = 'whatsflow:test-chat:v1';

export function leerConversacionGuardada(): ChatTurn[] {
  try {
    const crudo = sessionStorage.getItem(CLAVE_CHAT);
    if (!crudo) return [];
    const turnos: unknown = JSON.parse(crudo);
    if (!Array.isArray(turnos)) return [];
    // Se valida la forma antes de confiar: lo que hay en el almacenamiento lo
    // pudo escribir una versión anterior de la aplicación.
    return turnos.filter(
      (t): t is ChatTurn =>
        !!t && typeof t === 'object' && typeof (t as ChatTurn).text === 'string',
    );
  } catch {
    return [];
  }
}

export function guardarConversacion(turnos: ChatTurn[]): void {
  try {
    if (turnos.length === 0) sessionStorage.removeItem(CLAVE_CHAT);
    else sessionStorage.setItem(CLAVE_CHAT, JSON.stringify(turnos));
  } catch {
    // Sin espacio o con el almacenamiento bloqueado: el chat sigue funcionando
    // en memoria, solo que no sobrevive al cambio de sección. No vale romper la
    // pantalla por esto.
  }
}
