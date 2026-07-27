import { useCallback, useEffect, useState } from 'react';
import { api, esCancelacion } from './api';
import { useToast } from './toast-context';

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
