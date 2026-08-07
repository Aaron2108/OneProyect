import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { JwtPayload } from '../auth/auth.types';
import { RealtimeService, salaDeTenant } from './realtime.service';

/**
 * El extremo WebSocket del panel.
 *
 * Autenticación: el mismo JWT que la API REST, en el handshake. Un socket sin
 * token válido se desconecta antes de unirse a ninguna sala — no existe un
 * estado "conectado pero anónimo" desde el que pedir nada.
 *
 * Cada conexión entra en la sala de SU tenant y en ninguna más. El `tenantId`
 * sale del token verificado y no de lo que diga el cliente: es el mismo
 * principio que rige toda la API (ver backend/CLAUDE.md), y aquí importa
 * especialmente porque un socket vive minutos u horas, no una petición.
 */
@WebSocketGateway({
  namespace: '/realtime',
  // Se lee `process.env` y no `ConfigService` porque un decorador se evalúa al
  // cargar la clase, antes de que exista ningún inyector. Es el mismo origen
  // que fija `main.ts` para la API REST.
  cors: {
    origin: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Con `namespace`, lo que llega aquí es el Namespace y no el Server (el
   * Server no tiene salas propias de este namespace). Emitir sobre el Namespace
   * es justo lo que queremos: alcanza a las salas de tenant y a nadie más.
   */
  afterInit(namespace: Namespace): void {
    this.realtime.registrarEmisor(namespace);
    this.logger.log('Canal de tiempo real listo en /realtime');
  }

  async handleConnection(socket: Socket): Promise<void> {
    const token = this.tokenDe(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      await socket.join(salaDeTenant(payload.tenantId));
    } catch {
      // Token caducado o falso: fuera. El panel lo reintenta tras renovar sesión.
      socket.disconnect(true);
    }
  }

  /**
   * El token viaja en `auth` del handshake, que es donde lo pone socket.io-client
   * y —a diferencia de la query string— no acaba en los logs de acceso de
   * ningún proxy intermedio.
   */
  private tokenDe(socket: Socket): string | null {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const token = auth?.token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }
}
