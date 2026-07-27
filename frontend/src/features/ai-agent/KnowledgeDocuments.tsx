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
import { useRef, useState } from 'react';
import { api, uploadFile } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useRecurso } from '@/lib/use-recurso';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import type { KnowledgeDocument, KnowledgeUploadResult } from '@/lib/types';

const ACCEPT = '.pdf,.docx,.txt,.md';

/** Etiqueta y color de cada estado, para no repetir el mapeo en el JSX. */
const STATUS_LABEL: Record<KnowledgeDocument['status'], string> = {
  EXTRACTING: 'Procesando',
  PENDING_REVIEW: 'Pendiente de revisión',
  ACTIVE: 'La IA lo usa',
  FAILED: 'No se pudo leer',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
}: {
  isOwner: boolean;
  onChanged: () => void;
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
            Subí tus políticas, servicios o preguntas frecuentes y la IA responderá con esa
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
            <b className="text-[13.5px]">Revisá lo que se extrajo de “{review.filename}”</b>
            {review.extractionMethod === 'VISION' && (
              <span className="inline-flex items-center gap-1 rounded-xs bg-warn-tint px-2 py-0.5 text-[11.5px] text-warn">
                <ScanLine size={12} strokeWidth={2.25} /> Transcrito de un escaneo
              </span>
            )}
          </div>
          <p className="mb-2.5 text-[12.5px] text-ink-soft">
            La IA todavía no usa este documento. Confirmá que el texto es correcto: es lo que va
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

      <div ref={listRef} className="flex flex-col gap-2">
        {items.map((doc) => (
          <div key={doc.id} className="rounded-sm border border-line px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {doc.extractionMethod === 'VISION' ? (
                <ScanLine size={16} strokeWidth={2} className="flex-shrink-0 text-warn" />
              ) : (
                <FileText size={16} strokeWidth={2} className="flex-shrink-0 text-ink-faint" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                {doc.filename}
              </span>

              {doc.status === 'ACTIVE' && <Pill kind="ai" label={STATUS_LABEL.ACTIVE} />}
              {/* Estaba en STATUS_LABEL pero no se pintaba en ninguna parte: un
                  documento recién subido aparecía sin estado, como si no le
                  pasara nada, mientras el servidor seguía extrayendo su texto. */}
              {doc.status === 'EXTRACTING' && (
                <span className="inline-flex items-center gap-1 rounded-xs bg-[var(--muted-bg)] px-2 py-0.5 text-[11.5px] text-ink-soft">
                  <Loader2 size={12} strokeWidth={2.25} className="animate-spin" /> {STATUS_LABEL.EXTRACTING}
                </span>
              )}
              {doc.status === 'PENDING_REVIEW' && (
                <span className="inline-flex items-center gap-1 rounded-xs bg-warn-tint px-2 py-0.5 text-[11.5px] text-warn">
                  {STATUS_LABEL.PENDING_REVIEW}
                </span>
              )}
              {doc.status === 'FAILED' && (
                <span className="inline-flex items-center gap-1 rounded-xs bg-danger-tint px-2 py-0.5 text-[11.5px] text-danger">
                  <AlertTriangle size={12} strokeWidth={2.25} /> {STATUS_LABEL.FAILED}
                </span>
              )}

              <div className="flex flex-shrink-0 items-center gap-1">
                {doc.status !== 'FAILED' && (
                  <button
                    onClick={() => void showPreview(doc.id)}
                    disabled={busyId === doc.id}
                    title="Ver el texto extraído"
                    className="grid h-7 w-7 place-items-center rounded-xs text-ink-faint transition-colors duration-fast hover:bg-[var(--hover-bg)] hover:text-ink"
                  >
                    <Eye size={15} strokeWidth={2} />
                  </button>
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
                    title="Eliminar"
                    className="grid h-7 w-7 place-items-center rounded-xs text-ink-faint transition-colors duration-fast hover:bg-danger-tint hover:text-danger"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-[26px] text-[11.5px] text-ink-faint">
              <span>{formatBytes(doc.sizeBytes)}</span>
              {doc.pageCount != null && <span>{doc.pageCount} pág.</span>}
              {doc.charCount != null && (
                <span>{doc.charCount.toLocaleString('es')} caracteres</span>
              )}
              {doc.visionTokensUsed > 0 && (
                <span title="Costo de una sola vez al transcribir el escaneo, no por mensaje">
                  {doc.visionTokensUsed.toLocaleString('es')} tokens de transcripción
                </span>
              )}
              <span>{new Date(doc.createdAt).toLocaleDateString('es')}</span>
            </div>

            {doc.extractionError && (
              <p className="mt-1.5 pl-[26px] text-[12px] text-danger">{doc.extractionError}</p>
            )}

            {previewOf?.id === doc.id && (
              <pre className="mt-2.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-xs bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
                {previewOf.text}
              </pre>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-ink-disabled">
            <FileText size={24} strokeWidth={1.75} />
            <p className="m-0 text-[13px]">
              Todavía no subiste documentación. La IA responde solo con lo que escribiste arriba.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
