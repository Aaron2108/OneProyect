import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Field, Label, Textarea } from '@/components/ui/Input';
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

type FormState = Pick<BusinessProfile, 'businessHours' | 'services' | 'policies' | 'tone' | 'customInstructions'>;

const EMPTY_FORM: FormState = {
  businessHours: '',
  services: '',
  policies: '',
  tone: '',
  customInstructions: '',
};

export function AiAgentPage({ active }: { active: boolean }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'OWNER';
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      toast.show('Configuración del agente guardada');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[700px] p-5 sm:p-10">
      <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Agente IA</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Lo que la IA sabe de tu negocio antes de responder por WhatsApp. Cuanto más completo, más específicas
        (y menos genéricas) van a ser sus respuestas.
        {!isOwner && ' Solo el propietario puede editar esta configuración.'}
      </p>

      {loading ? (
        <div className="rounded bg-surface p-6 text-center text-sm text-ink-soft shadow-1">Cargando…</div>
      ) : (
        <form onSubmit={save} className="rounded bg-surface p-4 shadow-1 sm:p-5">
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
              <div className="mt-1 flex items-center justify-between text-[11.5px] text-ink-faint">
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
              <Button type="submit" variant="brand" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
