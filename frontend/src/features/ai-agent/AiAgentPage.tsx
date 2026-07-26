import { Bot } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
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
    hint: 'Cómo querés que suene la IA al responder.',
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

export function AiAgentPage({ active }: { active: boolean }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'OWNER';
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Se incrementa al guardar el perfil o cambiar la documentación, para que el
  // panel de contexto no siga mostrando un estado viejo.
  const [contextKey, setContextKey] = useState(0);
  // La lista es larga y no cambia: se calcula una vez, no en cada render.
  const [zonas] = useState(timeZoneOptions);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const profile = await api<BusinessProfile>('/business-profile');
        if (cancelled) return;
        setForm({
          businessHours: profile.businessHours ?? '',
          services: profile.services ?? '',
          policies: profile.policies ?? '',
          tone: profile.tone ?? '',
          customInstructions: profile.customInstructions ?? '',
          timeZone: profile.timeZone ?? '',
        });
        setUpdatedAt(profile.updatedAt);
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'No se pudo cargar la configuración del agente', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function save(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setSaving(true);
    try {
      const profile = await api<BusinessProfile>('/business-profile', { method: 'PUT', body: form });
      setUpdatedAt(profile.updatedAt);
      setContextKey((k) => k + 1);
      toast.show('Configuración del agente guardada');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

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
              <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-ink-faint">
                <span>{f.hint}</span>
                <span>{(form[f.key] ?? '').length}/{MAX_LENGTH}</span>
              </div>
            </Field>
          ))}

          {isOwner && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[12px] text-ink-faint">
                {updatedAt ? `Última actualización: ${new Date(updatedAt).toLocaleString('es')}` : 'Todavía sin configurar'}
              </span>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          )}
        </form>
      )}

      {!loading && (
        <div className="mt-6 flex flex-col gap-6">
          <KnowledgeDocuments
            isOwner={isOwner}
            onChanged={() => setContextKey((k) => k + 1)}
          />
          <AiContextPanel reloadKey={contextKey} />
          <AiTestChat isOwner={isOwner} />
        </div>
      )}
    </div>
  );
}
