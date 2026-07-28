import { Package, Plus, Search, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Field, Input, Label } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ImportReport, Product } from '@/lib/types';
import { centsToInput, formatPrice, inputToCents } from './products.util';

/**
 * Celda editable del catálogo (precio o stock).
 *
 * Es un campo *controlado* y sincronizado con el servidor. Antes era no
 * controlado (`defaultValue`) y se corregía escribiendo en el DOM a mano
 * (`e.target.value = …`), con dos consecuencias:
 *
 * - Si el guardado fallaba, la página recargaba el catálogo pero la celda
 *   seguía enseñando el texto rechazado: `defaultValue` solo se lee al montar.
 *   El comentario decía "vuelve al valor real" y no volvía.
 * - Tras guardar, la celda mostraba lo tecleado y no lo que quedó guardado.
 *
 * `valorServidor` es la fuente de la verdad: cuando cambia —porque se guardó,
 * porque falló y se recargó, o porque lo tocó otra persona— la celda se pone al
 * día sola. El ajuste se hace durante el render y no con un efecto: es el patrón
 * que recomienda React para "un prop cambió", y evita el parpadeo de pintar
 * primero el valor viejo.
 */
function CeldaEditable({
  valorServidor,
  className,
  inputMode,
  etiqueta,
  onGuardar,
}: {
  valorServidor: string;
  className: string;
  inputMode: 'decimal' | 'numeric';
  etiqueta: string;
  /** Devuelve false si lo escrito no vale; entonces la celda se restaura sola. */
  onGuardar: (texto: string) => boolean;
}): JSX.Element {
  const [texto, setTexto] = useState(valorServidor);
  const [ultimoDelServidor, setUltimoDelServidor] = useState(valorServidor);

  if (valorServidor !== ultimoDelServidor) {
    setUltimoDelServidor(valorServidor);
    setTexto(valorServidor);
  }

  return (
    <input
      className={className}
      value={texto}
      inputMode={inputMode}
      aria-label={etiqueta}
      onChange={(e) => setTexto(e.target.value)}
      // Al salir del campo y no en cada tecla: una petición por pulsación
      // saturaría la API y guardaría precios a medio escribir.
      onBlur={() => {
        if (!onGuardar(texto)) setTexto(valorServidor);
      }}
    />
  );
}

/**
 * Catálogo de productos con existencias.
 *
 * Es lo que le permite a la IA responder "¿tienen X?" con datos reales: la
 * herramienta `consultar_producto` lee esta tabla en vivo. A propósito NO se
 * resuelve subiendo un PDF con el inventario — un archivo es una foto de un
 * momento y el agente acabaría prometiendo existencias que ya no hay.
 */
export function ProductsPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'OWNER';
  const [items, setItems] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [nuevo, setNuevo] = useState({ name: '', sku: '', price: '', stock: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const yaCargoUnaVez = useRef(false);

  const load = useCallback(async (q?: string): Promise<void> => {
    setLoading(true);
    try {
      const search = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const res = await api<{ items: Product[] }>(`/products${search}`);
      setItems(res.items);
      setError('');
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo cargar el catálogo';
      // Sin esto, un catálogo que no se pudo cargar decía «Sin productos
      // todavía» — y en esta pantalla eso significa además que la IA se ha
      // quedado sin catálogo, que es una conclusión bastante peor que la real.
      setError(mensaje);
      toast.show(mensaje, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca al teclear, como el resto de listas del panel.
  //
  // Era la única que exigía pulsar un botón, y esa diferencia arrastraba un
  // fallo: `load(query)` se llama también al crear, al importar y al fallar el
  // guardado de una celda, y usa siempre lo que hay escrito en ese momento. Si
  // habías tecleado algo sin buscar, cualquiera de esas acciones aplicaba el
  // filtro de golpe y la tabla se recortaba sin que nadie lo hubiera pedido.
  // Buscando al teclear, lo escrito y lo aplicado no se pueden separar.
  useEffect(() => {
    const espera = yaCargoUnaVez.current ? 300 : 0;
    const id = setTimeout(() => {
      yaCargoUnaVez.current = true;
      void load(query);
    }, espera);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function crear(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    const priceCents = inputToCents(nuevo.price);
    if (priceCents === undefined) {
      toast.show('El precio no es un número válido', 'error');
      return;
    }
    const stock = nuevo.stock.trim() ? Number(nuevo.stock) : 0;
    if (!Number.isInteger(stock) || stock < 0) {
      toast.show('El stock debe ser un número entero', 'error');
      return;
    }
    setCreating(true);
    try {
      await api<Product>('/products', {
        method: 'POST',
        body: {
          name: nuevo.name.trim(),
          sku: nuevo.sku.trim() || undefined,
          priceCents: priceCents ?? undefined,
          stock,
        },
      });
      setNuevo({ name: '', sku: '', price: '', stock: '' });
      toast.show('Producto añadido');
      await load(query);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo crear', 'error');
    } finally {
      setCreating(false);
    }
  }

  /** Guarda un campo al salir del input, para no disparar una petición por tecla. */
  async function guardarCampo(
    product: Product,
    cambios: { stock?: number; priceCents?: number | null },
  ): Promise<void> {
    try {
      const actualizado = await api<Product>(`/products/${product.id}`, {
        method: 'PATCH',
        body: cambios,
      });
      setItems((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
      await load(query); // vuelve al valor real si el guardado falló
    }
  }

  async function borrar(product: Product): Promise<void> {
    try {
      await api(`/products/${product.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((p) => p.id !== product.id));
      toast.show('Producto eliminado');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo eliminar', 'error');
    }
  }

  async function importar(file: File): Promise<void> {
    try {
      const report = await uploadFile<ImportReport>('/products/import', file);
      const partes = [`${report.created} nuevos`, `${report.updated} actualizados`];
      if (report.errors.length > 0) partes.push(`${report.errors.length} con error`);
      toast.show(
        `Importación: ${partes.join(', ')}.`,
        report.errors.length > 0 ? 'error' : 'default',
      );
      if (report.errors.length > 0) {
        // Se listan para poder corregir el archivo, con el número de fila tal
        // como se ve en Excel.
        const detalle = report.errors
          .slice(0, 5)
          .map((e) => `fila ${e.row}: ${e.reason}`)
          .join(' · ');
        toast.show(detalle, 'error');
      }
      await load(query);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo importar', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-[980px] p-6 sm:p-10">
      {/* Importar no es un filtro y estaba en la misma fila que el buscador.
          Junto al título, que es donde vive lo que se le hace al catálogo
          entero, igual que en Contactos. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <Package size={22} strokeWidth={2} className="text-brand" /> Productos
          </h2>
          <p className="m-0 max-w-[62ch] text-sm text-ink-soft">
            Lo que la IA consulta cuando un cliente pregunta por disponibilidad o precio. Lo lee en
            vivo de aquí, así que lo que cambies se aplica al instante.
            {!isOwner && ' Solo el propietario puede editarlo.'}
          </p>
        </div>
        {isOwner && (
          <div className="flex-shrink-0">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importar(file);
                e.target.value = '';
              }}
            />
            <Button size="sm" variant="sec" type="button" onClick={() => fileRef.current?.click()}>
              <Upload size={15} strokeWidth={2.25} /> Importar CSV
            </Button>
          </div>
        )}
      </div>

      <div className="kpi-card mb-6">
        <div className="relative mb-4">
          <Search
            size={16}
            strokeWidth={2}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-disabled"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código o descripción"
            aria-label="Buscar productos"
            className="pl-10"
          />
        </div>

        {isOwner && (
          <form className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-4" onSubmit={crear}>
            <Field className="min-w-[180px] flex-1">
              <Label htmlFor="p-name">Nombre</Label>
              <Input
                id="p-name"
                value={nuevo.name}
                onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
                placeholder="Remera azul talla M"
                required
              />
            </Field>
            <Field className="w-[130px]">
              <Label htmlFor="p-sku">Código</Label>
              <Input
                id="p-sku"
                value={nuevo.sku}
                onChange={(e) => setNuevo({ ...nuevo, sku: e.target.value })}
                placeholder="opcional"
              />
            </Field>
            <Field className="w-[110px]">
              <Label htmlFor="p-price">Precio</Label>
              <Input
                id="p-price"
                value={nuevo.price}
                onChange={(e) => setNuevo({ ...nuevo, price: e.target.value })}
                placeholder="19.90"
                inputMode="decimal"
              />
            </Field>
            <Field className="w-[90px]">
              <Label htmlFor="p-stock">Stock</Label>
              <Input
                id="p-stock"
                value={nuevo.stock}
                onChange={(e) => setNuevo({ ...nuevo, stock: e.target.value })}
                placeholder="0"
                inputMode="numeric"
              />
            </Field>
            <Button size="sm" type="submit" disabled={creating || !nuevo.name.trim()}>
              <Plus size={15} strokeWidth={2.25} /> Añadir
            </Button>
          </form>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="kpi-card text-center text-sm text-ink-soft">Cargando…</div>
      ) : error && items.length === 0 ? (
        <EmptyState
          icon={TriangleAlert}
          title="No se pudo cargar el catálogo"
          description={error}
          action={
            <Button size="sm" variant="ghost" onClick={() => void load(query)}>
              Reintentar
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={query ? 'Sin resultados' : 'Sin productos todavía'}
          description={
            // El resto del panel habla de tú («añade», «escribe», «gestiona»);
            // aquí se colaba un voseo, «añadí… importá…», y era la única
            // pantalla donde el producto cambiaba de acento.
            query
              ? `No encontramos nada para “${query}”.`
              : isOwner
                ? 'Añade uno a mano o importa tu catálogo desde un CSV con las columnas nombre, sku, precio y stock.'
                : 'El propietario todavía no ha cargado el catálogo.'
          }
        />
      ) : (
        <div className="kpi-card overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              {/* `scope="col"`, como la tabla de Métricas: sin él el lector de
                  pantalla lee las celdas sueltas, sin decir de qué columna es
                  cada número. */}
              <tr className="border-b border-[var(--line)] text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                <th scope="col" className="pb-2 font-semibold">Producto</th>
                <th scope="col" className="pb-2 font-semibold">Código</th>
                <th scope="col" className="pb-2 font-semibold">Precio</th>
                <th scope="col" className="pb-2 font-semibold">Stock</th>
                {isOwner && <th scope="col" className="pb-2"><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-ink">{p.name}</div>
                    {p.description && (
                      <div className="text-[12px] text-ink-faint">{p.description}</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-ink-soft">{p.sku ?? '—'}</td>
                  <td className="py-2.5 pr-3">
                    {isOwner ? (
                      <CeldaEditable
                        className="wf-celda max-w-[96px]"
                        valorServidor={centsToInput(p.priceCents)}
                        inputMode="decimal"
                        etiqueta={`Precio de ${p.name}`}
                        onGuardar={(texto) => {
                          const cents = inputToCents(texto);
                          if (cents === undefined) {
                            toast.show('El precio no es un número válido', 'error');
                            return false;
                          }
                          if (cents !== p.priceCents) void guardarCampo(p, { priceCents: cents });
                          return true;
                        }}
                      />
                    ) : (
                      formatPrice(p)
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {isOwner ? (
                      <CeldaEditable
                        className={`wf-celda max-w-[74px] ${p.stock === 0 ? 'wf-celda--agotado' : ''}`}
                        valorServidor={String(p.stock)}
                        inputMode="numeric"
                        etiqueta={`Stock de ${p.name}`}
                        onGuardar={(texto) => {
                          const n = Number(texto);
                          // Se conserva tal cual el criterio anterior, incluido que
                          // `Number('')` sea 0: vaciar la celda pone el stock a cero.
                          if (!Number.isInteger(n) || n < 0) {
                            toast.show('El stock debe ser un entero', 'error');
                            return false;
                          }
                          if (n !== p.stock) void guardarCampo(p, { stock: n });
                          return true;
                        }}
                      />
                    ) : (
                      <span className={p.stock === 0 ? 'text-danger' : ''}>{p.stock}</span>
                    )}
                  </td>
                  {isOwner && (
                    <td className="py-2.5 text-right">
                      {/* Sin `aria-label` era un botón sin nombre: un lector de
                          pantalla anunciaba «botón» a secas, cuatro veces
                          seguidas, y ninguna decía qué se iba a borrar. */}
                      <Button
                        size="sm"
                        variant="sec"
                        aria-label={`Eliminar ${p.name}`}
                        onClick={() => void borrar(p)}
                      >
                        <Trash2 size={14} strokeWidth={2.25} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
