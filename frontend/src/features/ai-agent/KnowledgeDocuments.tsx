import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  AlertTriangle,
  Check,
  Eye,
  FileText,
  Loader2,
  ScanLine,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRecurso } from '@/lib/use-recurso';
import { Button } from '@/components/ui/Button';
import type { KnowledgeDocument, KnowledgeUploadResult } from '@/lib/types';

const ACCEPT = '.pdf,.docx,.txt,.md';

/** Etiqueta y color de cada estado, para no repetir el mapeo en el JSX. */
const STATUS_LABEL: Record<KnowledgeDocument['status'], string> = {
  EXTRACTING: 'Procesando',
  PENDING_REVIEW: 'Pendiente de revisión',
  ACTIVE: 'La IA lo usa',
  FAILED: 'No se pudo leer',
};

/** Recuento por estado que la página usa en su tarjeta de estado del agente. */
export interface ResumenDocumentos {
  total: number;
  activos: number;
  pendientes: number;
  fallidos: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Las tres etapas por las que pasa un documento, dibujadas como tres tramos.
 *
 * No es un porcentaje: el servidor no informa de ninguno, y pintar una barra
 * llenándose sería inventarse un avance que nadie está midiendo. Lo que sí hay
 * es un estado discreto, y estas son sus etapas reales — se extrae el texto, lo
 * revisa el dueño, la IA lo usa—, así que el tramo está lleno, en curso o
 * vacío, sin fingir precisión que no existe.
 */
function Etapas({ status }: { status: KnowledgeDocument['status'] }): JSX.Element {
  const alcanzadas =
    status === 'FAILED' ? 0 : status === 'EXTRACTING' ? 0 : status === 'PENDING_REVIEW' ? 1 : 3;
  const enCurso = status === 'EXTRACTING' ? 0 : status === 'PENDING_REVIEW' ? 1 : -1;
  const etiqueta =
    status === 'FAILED'
      ? 'No se pudo leer el documento'
      : status === 'EXTRACTING'
        ? 'Extrayendo el texto'
        : status === 'PENDING_REVIEW'
          ? 'Esperando tu revisión'
          : 'En uso por la IA';

  return (
    <div className="mt-3">
      <div className="flex gap-1" role="img" aria-label={etiqueta}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${
              status === 'FAILED'
                ? 'bg-danger/50'
                : i < alcanzadas
                  ? 'bg-brand'
                  : i === enCurso
                    ? 'bg-warn'
                    : 'bg-[var(--muted-bg)]'
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-faint">{etiqueta}</div>
    </div>
  );
}

/**
 * Documentación del negocio que alimenta a la IA.
 *
 * El flujo es deliberadamente de dos pasos: al subir, se muestra el texto que el
 * sistema extrajo y el documento queda pendiente; la IA solo lo usa cuando el
 * dueño confirma que ese texto es correcto. Sin esa revisión no habría forma de
 * saber qué entendió el sistema del PDF antes de que empiece a responderles a los
 * clientes con eso.
 */
export function KnowledgeDocuments({
  isOwner,
  onChanged,
  onResumen,
}: {
  isOwner: boolean;
  onChanged: () => void;
  /**
   * Reporta el recuento por estado hacia la página, para su tarjeta de estado.
   * El componente sigue cargando sus propios documentos: esto es solo el
   * resumen, así que la cabecera no repite la petición.
   */
  onResumen?: (resumen: ResumenDocumentos) => void;
}): JSX.Element {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [review, setReview] = useState<KnowledgeUploadResult | null>(null);
  const [previewOf, setPreviewOf] = useState<{ id: string; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });

  const { datos, recargar } = useRecurso<KnowledgeDocument[]>(
    '/knowledge/documents',
    'No se pudo cargar la documentación',
  );
  const items = datos ?? [];

  // `onResumen` llega como el `setState` de la página, cuya identidad es
  // estable, así que este efecto solo se dispara cuando cambian los documentos.
  useEffect(() => {
    if (!datos) return;
    onResumen?.({
      total: datos.length,
      activos: datos.filter((d) => d.status === 'ACTIVE').length,
      pendientes: datos.filter((d) => d.status === 'PENDING_REVIEW').length,
      fallidos: datos.filter((d) => d.status === 'FAILED').length,
    });
  }, [datos, onResumen]);

  async function handleFile(file: File): Promise<void> {
    setUploading(true);
    try {
      const result = await uploadFile<KnowledgeUploadResult>('/knowledge/documents', file);
      await recargar();
      if (result.status === 'FAILED') {
        toast.show(result.extractionError ?? 'No se pudo leer el documento', 'error');
      } else {
        // Se abre la revisión en vez de activar directo: el dueño tiene que ver
        // qué texto se extrajo antes de que la IA lo use.
        setReview(result);
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo subir el documento', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function activate(id: string): Promise<void> {
    setBusyId(id);
    try {
      await api(`/knowledge/documents/${id}/activate`, { method: 'POST' });
      toast.show('Documento activado: la IA ya puede consultarlo');
      setReview(null);
      await recargar();
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo activar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string): Promise<void> {
    setBusyId(id);
    try {
      await api(`/knowledge/documents/${id}`, { method: 'DELETE' });
      toast.show('Documento eliminado');
      if (review?.id === id) setReview(null);
      if (previewOf?.id === id) setPreviewOf(null);
      await recargar();
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo eliminar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function showPreview(id: string): Promise<void> {
    if (previewOf?.id === id) {
      setPreviewOf(null);
      return;
    }
    setBusyId(id);
    try {
      const { preview } = await api<{ preview: string }>(`/knowledge/documents/${id}/preview`);
      setPreviewOf({ id, text: preview });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo cargar el texto', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="kpi-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-[15.5px] font-bold tracking-tight">
            <FileText size={17} strokeWidth={2} className="text-ai" /> Documentación del negocio
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft">
            Sube tus políticas, servicios o preguntas frecuentes y la IA responderá con esa
            información en vez de generalidades. PDF, Word, texto o Markdown.
          </p>
        </div>
        {isOwner && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? (
                <>
                  <Loader2 size={15} strokeWidth={2.25} className="animate-spin" /> Procesando…
                </>
              ) : (
                <>
                  <Upload size={15} strokeWidth={2.25} /> Subir documento
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Revisión obligatoria del texto extraído antes de activar */}
      {review && (
        <div className="mb-4 rounded-sm border border-line-strong bg-[var(--hover-bg)] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <b className="text-[13.5px]">Revisa lo que se extrajo de “{review.filename}”</b>
            {review.extractionMethod === 'VISION' && (
              <span className="inline-flex items-center gap-1 rounded-xs bg-warn-tint px-2 py-0.5 text-[11.5px] text-warn">
                <ScanLine size={12} strokeWidth={2.25} /> Transcrito de un escaneo
              </span>
            )}
          </div>
          <p className="mb-2.5 text-[12.5px] text-ink-soft">
            La IA todavía no usa este documento. Confirma que el texto es correcto: es lo que va
            a leer para responderles a tus clientes.
          </p>
          <pre className="mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xs bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
            {review.preview}
            {review.previewTruncated && '\n\n[…texto recortado en la vista previa]'}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busyId === review.id} onClick={() => void activate(review.id)}>
              <Check size={15} strokeWidth={2.5} /> Es correcto, activarlo
            </Button>
            <Button size="sm" variant="sec" onClick={() => setReview(null)}>
              Revisar después
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busyId === review.id}
              onClick={() => void remove(review.id)}
            >
              <Trash2 size={15} strokeWidth={2.25} /> Descartar
            </Button>
          </div>
        </div>
      )}

      {/* Tarjetas en rejilla y no una lista vertical: cada documento es una
          ficha con su estado, su etapa y sus acciones, y a partir de 260px de
          ancho caben tantas como quepan. En columna, diez documentos eran diez
          filas idénticas y medio metro de scroll. */}
      <div ref={listRef} className="grid-docs">
        {items.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-col rounded-sm border border-line bg-[var(--row-hover)] p-3.5 transition-colors duration-fast hover:border-line-strong"
          >
            <div className="mb-2 flex items-start gap-2.5">
              {doc.extractionMethod === 'VISION' ? (
                <ScanLine size={16} strokeWidth={2} className="mt-0.5 flex-shrink-0 text-warn" />
              ) : (
                <FileText size={16} strokeWidth={2} className="mt-0.5 flex-shrink-0 text-ink-faint" />
              )}
              <span className="min-w-0 flex-1 break-words text-[13.5px] font-semibold" title={doc.filename}>
                {doc.filename}
              </span>
            </div>

            <div className="mb-1 flex flex-wrap gap-1.5">
              {doc.status === 'ACTIVE' && (
                <span className="inline-flex items-center gap-1 rounded-xs bg-ai-tint px-2 py-0.5 text-[11.5px] font-semibold text-ai">
                  <Check size={12} strokeWidth={2.5} /> {STATUS_LABEL.ACTIVE}
                </span>
              )}
              {/* Estaba en STATUS_LABEL pero no se pintaba en ninguna parte: un
                  documento recién subido aparecía sin estado, como si no le
                  pasara nada, mientras el servidor seguía extrayendo su texto. */}
              {doc.status === 'EXTRACTING' && (
                <span className="inline-flex items-center gap-1 rounded-xs bg-[var(--muted-bg)] px-2 py-0.5 text-[11.5px] text-ink-soft">
                  <Loader2 size={12} strokeWidth={2.25} className="animate-spin" /> {STATUS_LABEL.EXTRACTING}
                </span>
              )}
              {doc.status === 'PENDING_REVIEW' && (
                <span className="inline-flex items-center gap-1 rounded-xs bg-warn-tint px-2 py-0.5 text-[11.5px] font-semibold text-warn">
                  {STATUS_LABEL.PENDING_REVIEW}
                </span>
              )}
              {doc.status === 'FAILED' && (
                <span className="inline-flex items-center gap-1 rounded-xs bg-danger-tint px-2 py-0.5 text-[11.5px] font-semibold text-danger">
                  <AlertTriangle size={12} strokeWidth={2.25} /> {STATUS_LABEL.FAILED}
                </span>
              )}
            </div>

            <Etapas status={doc.status} />

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
              <div>
                <dt className="text-ink-disabled">Tamaño</dt>
                <dd className="m-0 text-ink-soft">{formatBytes(doc.sizeBytes)}</dd>
              </div>
              <div>
                <dt className="text-ink-disabled">Subido</dt>
                <dd className="m-0 text-ink-soft">{new Date(doc.createdAt).toLocaleDateString('es')}</dd>
              </div>
              {doc.pageCount != null && (
                <div>
                  <dt className="text-ink-disabled">Páginas</dt>
                  <dd className="m-0 text-ink-soft">{doc.pageCount}</dd>
                </div>
              )}
              {doc.charCount != null && (
                <div>
                  <dt className="text-ink-disabled">Caracteres</dt>
                  <dd className="m-0 text-ink-soft">{doc.charCount.toLocaleString('es')}</dd>
                </div>
              )}
              {doc.visionTokensUsed > 0 && (
                <div className="col-span-2">
                  <dt className="text-ink-disabled" title="Costo de una sola vez al transcribir el escaneo, no por mensaje">
                    Tokens de transcripción
                  </dt>
                  <dd className="m-0 text-ink-soft">{doc.visionTokensUsed.toLocaleString('es')}</dd>
                </div>
              )}
            </dl>

            {doc.extractionError && <p className="mt-2 text-[12px] text-danger">{doc.extractionError}</p>}

            {/* `mt-auto`: las acciones se pegan abajo, así quedan alineadas
                entre tarjetas aunque una tenga más metadatos que otra. */}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
              {doc.status !== 'FAILED' && (
                <Button
                  size="sm"
                  variant="sec"
                  disabled={busyId === doc.id}
                  onClick={() => void showPreview(doc.id)}
                >
                  <Eye size={14} strokeWidth={2} />
                  {previewOf?.id === doc.id ? 'Ocultar texto' : 'Ver texto'}
                </Button>
              )}
              {isOwner && doc.status === 'PENDING_REVIEW' && (
                <Button size="sm" disabled={busyId === doc.id} onClick={() => void activate(doc.id)}>
                  Activar
                </Button>
              )}
              {isOwner && (
                <button
                  onClick={() => void remove(doc.id)}
                  disabled={busyId === doc.id}
                  aria-label={`Eliminar ${doc.filename}`}
                  className="ml-auto grid h-7 w-7 flex-shrink-0 place-items-center rounded-xs text-ink-faint transition-colors duration-fast hover:bg-danger-tint hover:text-danger"
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              )}
            </div>

            {previewOf?.id === doc.id && (
              <pre className="mt-2.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-xs bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
                {previewOf.text}
              </pre>
            )}
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-ink-disabled">
          <FileText size={24} strokeWidth={1.75} />
          <p className="m-0 text-[13px]">
            Todavía no has subido documentación. La IA responde solo con lo que escribiste arriba.
          </p>
        </div>
      )}
    </div>
  );
}
