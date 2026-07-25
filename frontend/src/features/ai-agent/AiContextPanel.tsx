import { Braces, Coins, Loader2, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { AiContextPreview } from '@/lib/types';

/**
 * Muestra el contexto completo que va a recibir la IA antes de responder: el
 * prompt ya armado, cuánto ocupa en tokens y qué documentos lo alimentan.
 *
 * Sirve para auditar: el dueño ve exactamente qué sabe (y qué no sabe) su agente,
 * en vez de tener que deducirlo probando conversaciones. Como la documentación se
 * recupera por similitud, se puede escribir una consulta de prueba para ver qué
 * fragmentos entrarían ante esa pregunta concreta.
 */
export function AiContextPanel({ reloadKey }: { reloadKey: number }): JSX.Element {
  const toast = useToast();
  const [context, setContext] = useState<AiContextPreview | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (sampleQuery?: string): Promise<void> => {
      setLoading(true);
      try {
        const search = sampleQuery ? `?query=${encodeURIComponent(sampleQuery)}` : '';
        setContext(await api<AiContextPreview>(`/ai-context${search}`));
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'No se pudo cargar el contexto', 'error');
      } finally {
        setLoading(false);
      }
    },
    // toast es estable (viene del provider); incluirlo recrearía el callback en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Se recarga cuando cambia la documentación (reloadKey) para que el panel no
  // muestre un contexto viejo tras activar o borrar un documento.
  useEffect(() => {
    void load(query.trim() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return (
    <div className="kpi-card">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-[15.5px] font-bold tracking-tight">
          <Braces size={17} strokeWidth={2} className="text-brand" /> Contexto que recibe la IA
        </h3>
        <Button
          size="sm"
          variant="sec"
          disabled={loading}
          onClick={() => void load(query.trim() || undefined)}
        >
          {loading ? (
            <Loader2 size={15} strokeWidth={2.25} className="animate-spin" />
          ) : (
            <RefreshCw size={15} strokeWidth={2.25} />
          )}
          Actualizar
        </Button>
      </div>
      <p className="mb-4 text-[13px] text-ink-soft">
        Esto es exactamente lo que el agente sabe antes de contestar. La documentación se busca
        por similitud, así que podés probar con un mensaje de ejemplo para ver qué recupera.
      </p>

      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(query.trim() || undefined);
        }}
      >
        <div className="min-w-[220px] flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej: ¿cuánto cobran si cancelo el mismo día?"
          />
        </div>
        <Button size="sm" type="submit" variant="sec" disabled={loading}>
          <Search size={15} strokeWidth={2.25} /> Probar
        </Button>
      </form>

      {context && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--muted-bg)] px-2.5 py-1.5 text-[12px] text-ink-soft">
              <Coins size={13} strokeWidth={2.25} />
              {context.tokensEstimated ? '~' : ''}
              {context.tokens.toLocaleString('es')} tokens
              <span className="text-ink-faint">por mensaje</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--muted-bg)] px-2.5 py-1.5 text-[12px] text-ink-soft">
              {context.knowledgeChunksUsed} fragmento
              {context.knowledgeChunksUsed === 1 ? '' : 's'} de documentación
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--muted-bg)] px-2.5 py-1.5 text-[12px] text-ink-soft">
              {context.documents.length} documento
              {context.documents.length === 1 ? '' : 's'} activo
              {context.documents.length === 1 ? '' : 's'}
            </span>
          </div>

          {context.tokensEstimated && (
            <p className="mb-3 text-[11.5px] text-ink-faint">
              El conteo de tokens es aproximado: se calcula localmente porque no hay una API key
              de Anthropic configurada.
            </p>
          )}

          <p className="mb-2 text-[12px] text-ink-faint">
            Contexto recuperado para: <i>“{context.sampleQuery}”</i>
          </p>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-sm bg-canvas p-3.5 font-mono text-[11.5px] leading-relaxed text-ink-soft">
            {context.prompt}
          </pre>
        </>
      )}

      {!context && loading && (
        <p className="py-6 text-center text-[13px] text-ink-soft">Cargando contexto…</p>
      )}
    </div>
  );
}
