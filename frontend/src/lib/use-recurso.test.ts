import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListaPaginada, useRecurso } from './use-recurso';
import type { Page } from './types';

/**
 * El hook de listas paginadas concentra el mecanismo donde salieron dos de los
 * cinco fallos críticos de la fase anterior (el cursor congelado y la falta de
 * cancelación) y está debajo de la bandeja, que es la pantalla de trabajo. Por
 * eso se prueba de verdad y no solo por lectura.
 */

const avisos: Array<{ mensaje: string; tipo?: string }> = [];

vi.mock('./toast-context', () => ({
  useToast: () => ({
    show: (mensaje: string, tipo?: string) => {
      avisos.push({ mensaje, tipo });
    },
  }),
}));

/** Peticiones que ha visto el `api` simulado, en orden. */
let llamadas: Array<{ ruta: string; signal?: AbortSignal }> = [];
/** Qué contesta el `api` simulado a cada llamada. */
let respuestas: Array<unknown | Error> = [];

vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<typeof import('./api')>();
  return {
    ...real,
    api: (ruta: string, opts?: { signal?: AbortSignal }) => {
      llamadas.push({ ruta, signal: opts?.signal });
      const respuesta = respuestas.shift();
      if (respuesta instanceof Error) return Promise.reject(respuesta);
      return Promise.resolve(respuesta);
    },
  };
});

function pagina<T>(items: T[], nextCursor: string | null): Page<T> {
  return { items, nextCursor };
}

beforeEach(() => {
  llamadas = [];
  respuestas = [];
  avisos.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useListaPaginada', () => {
  it('la primera carga es inmediata y va sin cursor', async () => {
    respuestas = [pagina([{ id: 'a' }], 'cursor-1')];
    const { result } = renderHook(() => useListaPaginada<{ id: string }>('/contacts', 'error'));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(llamadas[0].ruta).toBe('/contacts');
    expect(result.current.cursor).toBe('cursor-1');
  });

  it('cargarMas pide la página siguiente y la añade — no repite la primera', async () => {
    // Este es exactamente el fallo C1: el cursor se quedaba congelado en la
    // clausura y "cargar más" volvía a pedir la página uno.
    respuestas = [pagina([{ id: 'a' }], 'cursor-1'), pagina([{ id: 'b' }], null)];
    const { result } = renderHook(() => useListaPaginada<{ id: string }>('/contacts', 'error'));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.cargarMas();
    });

    expect(llamadas[1].ruta).toBe('/contacts?cursor=cursor-1');
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.cursor).toBeNull();
  });

  it('el cursor se añade con & si la ruta ya trae filtros', async () => {
    respuestas = [pagina([{ id: 'a' }], 'c1'), pagina([], null)];
    const { result } = renderHook(() =>
      useListaPaginada<{ id: string }>('/conversations?status=OPEN', 'error'),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.cargarMas();
    });

    expect(llamadas[1].ruta).toBe('/conversations?status=OPEN&cursor=c1');
  });

  it('al cambiar el filtro reemplaza la lista en vez de acumularla', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    respuestas = [pagina([{ id: 'a' }], null), pagina([{ id: 'z' }], null)];
    const { result, rerender } = renderHook(({ ruta }) => useListaPaginada<{ id: string }>(ruta, 'error'), {
      initialProps: { ruta: '/contacts' },
    });

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    rerender({ ruta: '/contacts?q=ana' });
    // El rebote: la segunda búsqueda no sale hasta pasados los 300 ms.
    expect(llamadas).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['z']));
    expect(llamadas[1].ruta).toBe('/contacts?q=ana');
  });

  it('cancela la búsqueda anterior cuando cambia la ruta', async () => {
    // El fallo C5: sin cancelar, la respuesta lenta de una búsqueda anterior
    // llegaba después y pisaba los resultados de lo ya tecleado.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    respuestas = [pagina([{ id: 'a' }], null), pagina([{ id: 'z' }], null)];
    const { result, rerender } = renderHook(({ ruta }) => useListaPaginada<{ id: string }>(ruta, 'error'), {
      initialProps: { ruta: '/contacts?q=an' },
    });

    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0].signal?.aborted).toBe(false);

    rerender({ ruta: '/contacts?q=ana' });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(llamadas[0].signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['z']));
  });

  it('avisa y deja el error a mano cuando la petición falla', async () => {
    respuestas = [new Error('La red no responde')];
    const { result } = renderHook(() => useListaPaginada<{ id: string }>('/contacts', 'de reserva'));

    await waitFor(() => expect(result.current.error).toBe('La red no responde'));
    expect(avisos).toEqual([{ mensaje: 'La red no responde', tipo: 'error' }]);
    expect(result.current.items).toEqual([]);
  });

  it('una respuesta sin forma de página se trata como fallo, no como lista vacía', async () => {
    // Si `items` se quedara en undefined, la pantalla reventaría más tarde al
    // recorrer la lista, lejos de donde está el problema.
    respuestas = ['no es un error pero tampoco una página'];
    const { result } = renderHook(() => useListaPaginada<{ id: string }>('/contacts', 'de reserva'));

    await waitFor(() => expect(result.current.error).toBe('de reserva'));
    expect(result.current.items).toEqual([]);
    expect(result.current.cargando).toBe(false);
  });
});

describe('useRecurso', () => {
  it('carga al montar', async () => {
    respuestas = [[{ id: 'u1' }]];
    const { result } = renderHook(() => useRecurso<Array<{ id: string }>>('/users', 'error'));

    await waitFor(() => expect(result.current.datos).toEqual([{ id: 'u1' }]));
    expect(llamadas[0].ruta).toBe('/users');
    expect(result.current.cargando).toBe(false);
  });

  it('con la ruta a null no pide nada (diálogo cerrado)', async () => {
    const { result } = renderHook(() => useRecurso<unknown>(null, 'error'));
    expect(llamadas).toHaveLength(0);
    expect(result.current.cargando).toBe(false);
    expect(result.current.datos).toBeNull();
  });

  it('pide en cuanto la ruta deja de ser null', async () => {
    respuestas = [[{ id: 'n1' }]];
    const { result, rerender } = renderHook(({ ruta }) => useRecurso<Array<{ id: string }>>(ruta, 'error'), {
      initialProps: { ruta: null as string | null },
    });

    expect(llamadas).toHaveLength(0);
    rerender({ ruta: '/conversations/1/notes' });
    await waitFor(() => expect(result.current.datos).toEqual([{ id: 'n1' }]));
  });

  it('recargar espera de verdad a que lleguen los datos', async () => {
    // Importa para el orden: quien llama hace `await recargar()` y solo después
    // avisa "nota añadida". Si la promesa terminara antes de tiempo, el aviso
    // saldría con la lista todavía vieja.
    respuestas = [[{ id: 'n1' }], [{ id: 'n1' }, { id: 'n2' }]];
    const { result } = renderHook(() => useRecurso<Array<{ id: string }>>('/notas', 'error'));

    await waitFor(() => expect(result.current.datos).toHaveLength(1));
    await act(async () => {
      await result.current.recargar();
    });
    expect(result.current.datos).toHaveLength(2);
  });

  it('avisa una sola vez si falla', async () => {
    respuestas = [new Error('403 sin permiso')];
    const { result } = renderHook(() => useRecurso<unknown>('/users', 'de reserva'));

    await waitFor(() => expect(result.current.error).toBe('403 sin permiso'));
    expect(avisos).toHaveLength(1);
  });
});
