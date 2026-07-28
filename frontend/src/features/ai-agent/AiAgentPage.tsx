import { Bot, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, esCancelacion } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Label, Select, Textarea } from '@/components/ui/Input';
import { AiContextPanel } from './AiContextPanel';
import { AiTestChat } from './AiTestChat';
import { KnowledgeDocuments } from './KnowledgeDocuments';
import type { BusinessProfile } from '@/lib/types';

const MAX_LENGTH = 1000;

const FIELDS: Array<{ key: keyof FormState; label: string; placeholder: string; hint: string }> = [
  {
    key: 'businessHours',
    label: 'Horario de atención',
    placeholder: 'Ej: Lunes a viernes de 9:00 a 18:00, sábados de 9:00 a 13:00.',
    hint: 'Cuándo puede atender el negocio, para que la IA lo sepa responder.',
  },
  {
    key: 'services',
    label: 'Servicios o productos',
    placeholder: 'Ej: Cortes de cabello, coloración, tratamientos capilares.',
    hint: 'Qué ofrece el negocio, en tus palabras.',
  },
  {
    key: 'policies',
    label: 'Políticas',
    placeholder: 'Ej: Cancelaciones con 24h de anticipación, se cobra seña del 50%.',
    hint: 'Reglas del negocio: cancelaciones, pagos, envíos, garantías, etc.',
  },
  {
    key: 'tone',
    label: 'Tono del agente',
    placeholder: 'Ej: Cercano y cálido, tuteando siempre al cliente.',
    hint: 'Cómo quieres que suene la IA al responder.',
  },
  {
    key: 'customInstructions',
    label: 'Instrucciones adicionales',
    placeholder: 'Ej: Si preguntan por precios exactos, pedir que confirmen por teléfono.',
    hint: 'Cualquier otra cosa que la IA deba tener en cuenta.',
  },
];

type FormState = Pick<
  BusinessProfile,
  'businessHours' | 'services' | 'policies' | 'tone' | 'customInstructions' | 'timeZone'
>;

const EMPTY_FORM: FormState = {
  businessHours: '',
  services: '',
  policies: '',
  tone: '',
  customInstructions: '',
  timeZone: '',
};

/**
 * Zonas horarias que ofrece el desplegable. Se piden al navegador en vez de
 * mantener una lista a mano: así está siempre completa y al día. Si el navegador
 * no lo soporta, queda al menos la suya detectada, para no dejar el campo vacío.
 */
function timeZoneOptions(): string[] {
  const propia = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const soportadas = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf?.('timeZone');
  return soportadas?.length ? soportadas : [propia].filter(Boolean);
}

export function AiAgentPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'OWNER';
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Copia de lo último que confirmó el servidor, para saber si hay cambios sin
  // guardar. Es un objeto de seis cadenas: compararlo entero sale gratis.
  const [guardado, setGuardado] = useState<FormState>(EMPTY_FORM);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Se incrementa al guardar el perfil o cambiar la documentación, para que el
  // panel de contexto no siga mostrando un estado viejo.
  const [contextKey, setContextKey] = useState(0);
  // La lista es larga y no cambia: se calcula una vez, no en cada render.
  const [zonas] = useState(timeZoneOptions);

  const cargar = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    try {
      const profile = await api<BusinessProfile>('/business-profile', { signal });
      const cargado: FormState = {
        businessHours: profile.businessHours ?? '',
        services: profile.services ?? '',
        policies: profile.policies ?? '',
        tone: profile.tone ?? '',
        customInstructions: profile.customInstructions ?? '',
        timeZone: profile.timeZone ?? '',
      };
      setForm(cargado);
      setGuardado(cargado);
      setUpdatedAt(profile.updatedAt);
      setError('');
    } catch (e) {
      if (esCancelacion(e)) return;
      const mensaje = e instanceof Error ? e.message : 'No se pudo cargar la configuración del agente';
      // Esto no es solo cuestión de avisar. Si la carga fallaba, el formulario
      // se quedaba con los seis campos vacíos y el botón de guardar activo:
      // bastaba con pulsarlo para mandar un PUT con todo en blanco y borrar la
      // configuración real del negocio. Mientras no se sepa qué hay guardado,
      // no se enseña el formulario.
      setError(mensaje);
      toast.show(mensaje, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  async function save(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setSaving(true);
    try {
      const profile = await api<BusinessProfile>('/business-profile', { method: 'PUT', body: form });
      setUpdatedAt(profile.updatedAt);
      setGuardado(form);
      setContextKey((k) => k + 1);
      toast.show('Configuración del agente guardada');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  const hayCambios = FIELDS.some((f) => (form[f.key] ?? '') !== (guardado[f.key] ?? '')) ||
    (form.timeZone ?? '') !== (guardado.timeZone ?? '');

  return (
    <div className="mx-auto max-w-[720px] p-6 sm:p-10">
      <h2 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
        <Bot size={22} strokeWidth={2} className="text-ai" /> Agente IA
      </h2>
      <p className="mb-6 text-sm text-ink-soft">
        Lo que la IA sabe de tu negocio antes de responder por WhatsApp. Cuanto más completo, más específicas
        (y menos genéricas) van a ser sus respuestas.
        {!isOwner && ' Solo el propietario puede editar esta configuración.'}
      </p>

      {loading ? (
        <div className="kpi-card text-center text-sm text-ink-soft">Cargando…</div>
      ) : error ? (
        <div className="kpi-card">
          <EmptyState
            icon={TriangleAlert}
            title="No se pudo cargar la configuración"
            description={error}
            action={
              <Button size="sm" variant="ghost" onClick={() => void cargar()}>
                Reintentar
              </Button>
            }
          />
        </div>
      ) : (
        <form onSubmit={save} className="kpi-card">
          <Field>
            <Label htmlFor="timeZone">Zona horaria del negocio</Label>
            <Select
              id="timeZone"
              value={form.timeZone ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, timeZone: e.target.value }))}
              disabled={!isOwner}
            >
              <option value="">Usar la del servidor</option>
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
            <div className="mt-1.5 text-[11.5px] text-ink-faint">
              En qué horario agenda la IA. Si dice una hora, será esta: sin la zona correcta las
              citas quedan corridas.
            </div>
          </Field>

          {FIELDS.map((f) => (
            <Field key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <Textarea
                id={f.key}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                maxLength={MAX_LENGTH}
                rows={3}
                disabled={!isOwner}
              />
              {/* El contador solo cuando empieza a importar. Estaba siempre, y
                  «0/1000» debajo de un campo vacío no informa de nada: son seis
                  cifras repetidas compitiendo con las seis pistas, que sí
                  dicen algo. */}
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[11.5px] text-ink-faint">
                <span>{f.hint}</span>
                {(form[f.key] ?? '').length > MAX_LENGTH * 0.8 && (
                  <span className="tabular-nums flex-shrink-0 text-warn">
                    {(form[f.key] ?? '').length}/{MAX_LENGTH}
                  </span>
                )}
              </div>
            </Field>
          ))}

          {isOwner && (
            // El pie se queda pegado al fondo mientras se edita.
            //
            // El formulario mide unos ochocientos píxeles y debajo hay tres
            // bloques más, así que en cuanto tocabas el primer campo el botón
            // de guardar quedaba fuera de la pantalla y nada avisaba de que
            // hubiera cambios pendientes: se podía cambiar el tono del agente,
            // irse a otra sección y perderlo sin un solo aviso.
            <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-line bg-[var(--surface-glass)] px-5 py-3.5 backdrop-blur">
              <span className="text-[12px] text-ink-faint">
                {hayCambios
                  ? 'Hay cambios sin guardar'
                  : updatedAt
                    ? `Guardado el ${new Date(updatedAt).toLocaleString('es')}`
                    : 'Todavía sin configurar'}
              </span>
              <Button type="submit" disabled={saving || !hayCambios}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          )}
        </form>
      )}

      {/* Fuera del bloque de carga a propósito: nada de esto depende del perfil,
          y meterlo dentro los desmontaba cada vez que el perfil se recargaba.
          Ahí nació el fallo de que la conversación de prueba se borrara. */}
      <div className="mt-6 flex flex-col gap-6">
        <KnowledgeDocuments isOwner={isOwner} onChanged={() => setContextKey((k) => k + 1)} />
        <AiContextPanel reloadKey={contextKey} />
        <AiTestChat isOwner={isOwner} />
      </div>
    </div>
  );
}
