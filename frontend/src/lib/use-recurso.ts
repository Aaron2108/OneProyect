import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { api, esCancelacion } from './api';
import { useToast } from './toast-context';
import type { Page } from './types';

/**
 * Carga una lista (o un objeto) de la API y mantiene su estado.
 *
 * Existía el mismo bloque de quince líneas copiado en cinco pantallas: un
 * `useState` para los datos, otro para el error, una función `load` con su
 * try/catch y su toast, y un `useEffect` de montaje con su `eslint-disable`.
 * Cada copia se arreglaba por separado —de hecho, hasta hace poco varias no
 * tenían el catch— y esa es exactamente la clase de deuda que se paga en
 * incidentes: el fallo se corrige en una pantalla y sigue vivo en las otras.
 *
 * Deliberadamente NO cubre la bandeja ni los contactos: esas listas son
 * paginadas, con cursor, filtros y rebote, y meterlas aquí obligaría a un hook
 * genérico que hace de todo. Ver el informe.
 *
 * @param ruta      Ruta de la API. `null` = todavía no hay que pedir nada (por
 *                  ejemplo, un diálogo cerrado).
 * @param mensajeError Qué decir si el error no trae mensaje propio.
 */
export function useRecurso<T>(
  ruta: string | null,
  mensajeError: string,
): {
  datos: T | null;
  cargando: boolean;
  error: string;
  /** Vuelve a pedir. La promesa termina cuando los datos ya están en el estado. */
  recargar: () => Promise<void>;
} {
  const toast = useToast();
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(ruta !== null);
  const [error, setError] = useState('');

  // `cargar` recibe la señal en vez de crear el AbortController: así el efecto
  // puede cancelar su propia petición al desmontar, y una recarga manual
  // (después de guardar algo) se deja terminar.
  const cargar = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (ruta === null) return;
      setCargando(true);
      try {
        const res = await api<T>(ruta, { signal });
        setDatos(res);
        setError('');
      } catch (e) {
        // Cancelada al cambiar de pantalla: no es un fallo que contar.
        if (esCancelacion(e)) return;
        const mensaje = e instanceof Error ? e.message : mensajeError;
        setError(mensaje);
        toast.show(mensaje, 'error');
      } finally {
        setCargando(false);
      }
    },
    // `toast` y `mensajeError` quedan fuera a propósito: el primero no es
    // estable a ojos del linter (sale de un hook propio) y el segundo es un
    // literal. Incluirlos rehría la petición sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruta],
  );

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  const recargar = useCallback(() => cargar(), [cargar]);

  return { datos, cargando, error, recargar };
}

/**
 * Lista paginada por cursor, con búsqueda que rebota y cancelación.
 *
 * Es el mismo mecanismo que la bandeja y los contactos tenían copiado cada uno
 * por su lado — y donde salieron dos de los cinco fallos críticos de la fase
 * anterior: el cursor congelado en una clausura (así "cargar más" repetía la
 * primera página) y la falta de cancelación (así una búsqueda lenta pisaba los
 * resultados de lo que ya se había tecleado). Estando en un solo sitio, esos
 * fallos solo se pueden volver a cometer una vez.
 *
 * @param ruta         Ruta ya construida con sus filtros, sin `cursor`. Cuando
 *                     cambia, se recarga desde la primera página.
 * @param mensajeError Qué decir si el error no trae mensaje propio.
 */
export function useListaPaginada<T>(
  ruta: string,
  mensajeError: string,
): {
  items: T[];
  /** Para retocar un elemento ya cargado sin volver a pedir la lista. */
  setItems: Dispatch<SetStateAction<T[]>>;
  /** Hay más páginas; es el cursor de la siguiente. */
  cursor: string | null;
  cargando: boolean;
  error: string;
  cargarMas: () => Promise<void>;
  recargar: () => Promise<void>;
} {
  const toast = useToast();
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const yaCargoUnaVez = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>();
  // El cursor también en una ref: `pedir` se memoriza por `ruta`, así que
  // leerlo del estado devolvería el de cuando se creó la función. Ese
  // despiste exacto es el que hacía que "cargar más" repitiera la página uno.
  const cursorRef = useRef<string | null>(null);

  const pedir = useCallback(
    async (reset: boolean, signal?: AbortSignal): Promise<void> => {
      setCargando(true);
      const separador = ruta.includes('?') ? '&' : '?';
      const url =
        !reset && cursorRef.current
          ? `${ruta}${separador}cursor=${encodeURIComponent(cursorRef.current)}`
          : ruta;
      try {
        const res = await api<Page<T>>(url, { signal });
        // Si lo que llega no tiene forma de página, se trata como fallo: sin
        // esto `items` se quedaba en undefined y la pantalla reventaba después,
        // al recorrer la lista, lejos de donde estaba el problema.
        if (!res || !Array.isArray(res.items)) throw new Error(mensajeError);
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        cursorRef.current = res.nextCursor;
        setCursor(res.nextCursor);
        setError('');
      } catch (e) {
        // Cancelada porque se siguió tecleando o se salió de la pantalla: su
        // respuesta ya no vale y no hay error que enseñar.
        if (esCancelacion(e)) return;
        const mensaje = e instanceof Error ? e.message : mensajeError;
        setError(mensaje);
        toast.show(mensaje, 'error');
      } finally {
        setCargando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruta],
  );

  useEffect(() => {
    clearTimeout(temporizador.current);
    const control = new AbortController();
    // La primera carga es inmediata; a partir de ahí se espera a que el usuario
    // deje de teclear. Sin el rebote se pediría una lista por pulsación.
    const espera = yaCargoUnaVez.current ? 300 : 0;
    temporizador.current = setTimeout(() => {
      yaCargoUnaVez.current = true;
      void pedir(true, control.signal);
    }, espera);
    return () => {
      clearTimeout(temporizador.current);
      control.abort();
    };
  }, [pedir]);

  const cargarMas = useCallback(() => pedir(false), [pedir]);
  const recargar = useCallback(() => pedir(true), [pedir]);

  return { items, setItems, cursor, cargando, error, cargarMas, recargar };
}
