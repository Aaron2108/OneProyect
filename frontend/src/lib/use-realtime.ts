import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';
import type { EventoPanel } from './types';

/** Un único socket para todo el panel, compartido por quien lo necesite. */
let socket: Socket | null = null;
/** Cuántas pantallas lo están usando: al llegar a cero se cierra. */
let suscriptores = 0;

const NOMBRE_EVENTO = 'panel';

function conectar(): Socket {
  if (socket) return socket;
  // `path` por defecto (/socket.io) sobre el namespace /realtime. En desarrollo
  // el proxy de Vite lo reenvía al backend con `ws: true`; en producción el
  // panel vive en otro origen y se usa la URL de la API.
  const base = import.meta.env.VITE_API_URL ?? '';
  socket = io(`${base}/realtime`, {
    // El token va en el handshake, no en la query: así no acaba escrito en los
    // logs de acceso de ningún proxy por el que pase la conexión.
    auth: { token: getToken() },
    transports: ['websocket'],
  });
  return socket;
}

/**
 * Escucha los avisos en vivo del backend.
 *
 * El socket es uno solo para todo el panel aunque lo usen varias pantallas: son
 * eventos del negocio entero, no de una vista, y abrir una conexión por
 * componente multiplicaría las conexiones del servidor sin traer nada nuevo.
 *
 * El manejador se guarda en una ref y el efecto no depende de él: si dependiera,
 * cada render de la pantalla que llama —y la bandeja renderiza en cada
 * tecla del buscador— desmontaría y volvería a montar el listener.
 */
export function useRealtime(alRecibir: (evento: EventoPanel) => void): void {
  const manejador = useRef(alRecibir);
  manejador.current = alRecibir;

  useEffect(() => {
    // Sin sesión no hay a qué suscribirse; el backend cerraría el socket igual.
    if (!getToken()) return;

    const s = conectar();
    suscriptores++;
    const escuchar = (evento: EventoPanel): void => manejador.current(evento);
    s.on(NOMBRE_EVENTO, escuchar);

    return () => {
      s.off(NOMBRE_EVENTO, escuchar);
      suscriptores--;
      // El cierre se aplaza un tick a propósito. En desarrollo, StrictMode monta
      // el efecto, lo limpia y lo vuelve a montar de inmediato; cerrando aquí
      // mismo se abortaba el socket a medio abrir y la consola avisaba de una
      // conexión fallida que no lo era. Al aplazarlo, el remontaje vuelve a
      // sumar antes de la comprobación y el socket se reutiliza.
      //
      // Vale también para navegar entre dos pantallas que escuchan: la nueva se
      // suscribe antes de que la anterior llegue a cerrar nada.
      setTimeout(() => {
        // Se cierra solo cuando ya no escucha nadie: si dos pantallas comparten
        // el socket, la primera en desmontarse dejaría muda a la otra.
        if (suscriptores === 0 && socket === s) {
          s.disconnect();
          socket = null;
        }
      }, 0);
    };
  }, []);
}

/**
 * Cierra el socket. Lo llama el cierre de sesión: el token con el que se abrió
 * ya no vale, y dejarlo vivo mantendría abierta una conexión autenticada como
 * quien acaba de salir.
 */
export function cerrarRealtime(): void {
  socket?.disconnect();
  socket = null;
  suscriptores = 0;
}
