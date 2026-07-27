import { Package, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Field, Input, Label } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ImportReport, Product } from '@/lib/types';

/** Céntimos -> texto editable ("1990" -> "19.90"). */
function centsToInput(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

/** Texto -> céntimos. Devuelve undefined si no es un número válido. */
function inputToCents(valor: string): number | null | undefined {
  const limpio = valor.trim().replace(',', '.');
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

function formatPrice(product: Product): string {
  if (product.priceCents == null) return '—';
  const importe = (product.priceCents / 100).toFixed(2);
  return product.currency ? `${importe} ${product.currency}` : importe;
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
  const [creating, setCreating] = useState(false);
  const [nuevo, setNuevo] = useState({ name: '', sku: '', price: '', stock: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q?: string): Promise<void> => {
    setLoading(true);
    try {
      const search = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const res = await api<{ items: Product[] }>(`/products${search}`);
      setItems(res.items);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo cargar el catálogo', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <h2 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
        <Package size={22} strokeWidth={2} className="text-brand" /> Productos
      </h2>
      <p className="mb-6 text-sm text-ink-soft">
        Lo que la IA consulta cuando un cliente pregunta por disponibilidad o precio. Lo lee en
        vivo de aquí, así que lo que cambies se aplica al instante.
        {!isOwner && ' Solo el propietario puede editarlo.'}
      </p>

      <div className="kpi-card mb-6">
        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(query);
          }}
        >
          <div className="min-w-[220px] flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, código o descripción…"
            />
          </div>
          <Button size="sm" variant="sec" type="submit" disabled={loading}>
            <Search size={15} strokeWidth={2.25} /> Buscar
          </Button>
          {isOwner && (
            <>
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
              <Button
                size="sm"
                variant="sec"
                type="button"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} strokeWidth={2.25} /> Importar CSV
              </Button>
            </>
          )}
        </form>

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
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin productos todavía"
          description={
            isOwner
              ? 'Añadí uno a mano o importá tu catálogo desde un CSV con las columnas nombre, sku, precio y stock.'
              : 'El propietario todavía no cargó el catálogo.'
          }
        />
      ) : (
        <div className="kpi-card overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 font-semibold">Producto</th>
                <th className="pb-2 font-semibold">Código</th>
                <th className="pb-2 font-semibold">Precio</th>
                <th className="pb-2 font-semibold">Stock</th>
                {isOwner && <th className="pb-2" />}
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
                      <input
                        className="w-[92px] rounded-sm bg-canvas px-2 py-1 text-[13px] text-ink-soft"
                        defaultValue={centsToInput(p.priceCents)}
                        inputMode="decimal"
                        onBlur={(e) => {
                          const cents = inputToCents(e.target.value);
                          if (cents === undefined) {
                            toast.show('El precio no es un número válido', 'error');
                            e.target.value = centsToInput(p.priceCents);
                            return;
                          }
                          if (cents !== p.priceCents) void guardarCampo(p, { priceCents: cents });
                        }}
                      />
                    ) : (
                      formatPrice(p)
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {isOwner ? (
                      <input
                        className={`w-[70px] rounded-sm bg-canvas px-2 py-1 text-[13px] ${
                          p.stock === 0 ? 'text-danger' : 'text-ink-soft'
                        }`}
                        defaultValue={String(p.stock)}
                        inputMode="numeric"
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isInteger(n) || n < 0) {
                            toast.show('El stock debe ser un entero', 'error');
                            e.target.value = String(p.stock);
                            return;
                          }
                          if (n !== p.stock) void guardarCampo(p, { stock: n });
                        }}
                      />
                    ) : (
                      <span className={p.stock === 0 ? 'text-danger' : ''}>{p.stock}</span>
                    )}
                  </td>
                  {isOwner && (
                    <td className="py-2.5 text-right">
                      <Button size="sm" variant="sec" onClick={() => void borrar(p)}>
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
