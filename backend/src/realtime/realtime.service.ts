import { Injectable, Logger } from '@nestjs/common';
import { EVENTO_PANEL, EventoPanel } from './realtime.events';

/**
 * Lo mínimo que hace falta para mandar algo a una sala.
 *
 * Se declara aquí en vez de importar el tipo de socket.io para que ningún
 * servicio de negocio arrastre esa dependencia por el hecho de emitir un aviso
 * —y para poder probar esto con un objeto de tres líneas—.
 */
export interface EmisorDeSalas {
  to(sala: string): { emit(evento: string, datos: unknown): unknown };
}

/**
 * Punto por el que el resto del backend avisa al panel de que algo cambió.
 *
 * Existe separado del gateway para que `ConversationsService` y el worker de
 * entrada solo conozcan `emitirATenant`. Si mañana esto pasa a ser SSE o una
 * cola de mensajes, el cambio es este archivo y el gateway, no los quince
 * sitios que emiten.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private emisor: EmisorDeSalas | null = null;

  /** Lo llama el gateway al arrancar. */
  registrarEmisor(emisor: EmisorDeSalas): void {
    this.emisor = emisor;
  }

  /**
   * Manda un evento a todas las pestañas abiertas de UN negocio.
   *
   * El aislamiento por tenant es el punto crítico: la sala se deriva del JWT
   * verificado en el handshake, nunca de nada que mande el cliente. Sin eso, un
   * suscriptor podría pedir la sala de otro negocio y escuchar su bandeja.
   */
  emitirATenant(tenantId: string, evento: EventoPanel): void {
    if (!this.emisor) {
      // Pasa en tests y en arranques donde el gateway no se ha montado. No es
      // un fallo: el panel se enterará en su siguiente recarga.
      this.logger.debug(`Sin canal de tiempo real; evento ${evento.tipo} no emitido`);
      return;
    }
    this.emisor.to(salaDeTenant(tenantId)).emit(EVENTO_PANEL, evento);
  }
}

/** Nombre de la sala de un negocio. Con prefijo para no chocar con socket ids. */
export function salaDeTenant(tenantId: string): string {
  return `tenant:${tenantId}`;
}
