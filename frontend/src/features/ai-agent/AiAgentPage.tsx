import {
  Bot,
  Braces,
  CircleCheck,
  CircleDashed,
  Clock,
  FileText,
  Globe,
  Play,
  RefreshCw,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, esCancelacion } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Label, Select, Textarea } from '@/components/ui/Input';
import { AiContextPanel, type ResumenContexto } from './AiContextPanel';
import { AiTestChat } from './AiTestChat';
import { KnowledgeDocuments, type ResumenDocumentos } from './KnowledgeDocuments';
import type { BusinessProfile } from '@/lib/types';

const MAX_LENGTH = 1000;

interface CampoPerfil {
  key: keyof FormState;
  label: string;
  placeholder: string;
  hint: string;
}

/**
 * Los cinco campos de texto, repartidos en las dos columnas de configuración.
 *
 * La división no es estética: a la izquierda va lo que describe al negocio
 * —datos que serían los mismos aunque contestara una persona— y a la derecha lo
 * que gobierna cómo habla el agente. Son las dos preguntas distintas que se
 * vienen a responder aquí, y estaban mezcladas en una sola lista de cinco.
 */
const CAMPOS_NEGOCIO: CampoPerfil[] = [
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
];

const CAMPOS_AGENTE: CampoPerfil[] = [
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

const TODOS_LOS_CAMPOS = [...CAMPOS_NEGOCIO, ...CAMPOS_AGENTE];

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

/** Una fila de la tarjeta de estado: icono, qué se mide y cómo está. */
function FilaEstado({
  icon: Icon,
  label,
  value,
  tono = 'neutro',
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  tono?: 'ok' | 'aviso' | 'neutro';
}): JSX.Element {
  const color =
    tono === 'ok' ? 'text-brand' : tono === 'aviso' ? 'text-warn' : 'text-ink';
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
      <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-ink-soft">
        <Icon size={15} strokeWidth={2} className="flex-shrink-0 text-ink-disabled" />
        <span className="truncate">{label}</span>
      </span>
      <b className={`flex-shrink-0 text-right text-[13px] ${color}`}>{value}</b>
    </div>
  );
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
  // Lo que los dos bloques de abajo reportan hacia arriba para la tarjeta de
  // estado. Siguen cargando sus propios datos: esto es solo el resumen, así que
  // la cabecera puede decir cómo está el agente sin repetir sus peticiones.
  const [resumenDocs, setResumenDocs] = useState<ResumenDocumentos | null>(null);
  const [resumenContexto, setResumenContexto] = useState<ResumenContexto | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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

  const hayCambios =
    TODOS_LOS_CAMPOS.some((f) => (form[f.key] ?? '') !== (guardado[f.key] ?? '')) ||
    (form.timeZone ?? '') !== (guardado.timeZone ?? '');
  const completados = TODOS_LOS_CAMPOS.filter((f) => (guardado[f.key] ?? '').trim()).length;

  /** Un textarea del perfil, con su etiqueta, su pista y su contador. */
  function campo(f: CampoPerfil): JSX.Element {
    const largo = (form[f.key] ?? '').length;
    return (
      <Field key={f.key}>
        <Label htmlFor={f.key}>{f.label}</Label>
        <Textarea
          id={f.key}
          value={form[f.key] ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
          placeholder={f.placeholder}
          maxLength={MAX_LENGTH}
          rows={4}
          disabled={!isOwner}
        />
        {/* El contador solo cuando empieza a importar: «0/1000» debajo de un
            campo vacío no informa de nada y compite con la pista, que sí. */}
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[11.5px] text-ink-faint">
          <span>{f.hint}</span>
          {largo > MAX_LENGTH * 0.8 && (
            <span className="tabular-nums flex-shrink-0 text-warn">
              {largo}/{MAX_LENGTH}
            </span>
          )}
        </div>
      </Field>
    );
  }

  return (
    <div className="page-wide">
      <div className="mb-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <Bot size={22} strokeWidth={2} className="text-ai" /> Agente IA
        </h2>
        <p className="m-0 max-w-[68ch] text-sm text-ink-soft">
          Lo que la IA sabe de tu negocio antes de responder por WhatsApp. Cuanto más completo, más específicas
          (y menos genéricas) van a ser sus respuestas.
          {!isOwner && ' Solo el propietario puede editar esta configuración.'}
        </p>
      </div>

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
        <div className="stack-lg">
          {/* ---- Fila 1: cómo está el agente, y qué hacer con él ---- */}
          <div className="grid-2-1">
            <section className="reveal kpi-card">
              <div className="sec-head">
                <span className="sec-head__eyebrow">Estado</span>
                <h3 className="sec-head__title font-display">Cómo está tu agente ahora mismo</h3>
              </div>
              <FilaEstado
                icon={completados === TODOS_LOS_CAMPOS.length ? CircleCheck : CircleDashed}
                label="Campos de configuración completados"
                value={`${completados} de ${TODOS_LOS_CAMPOS.length}`}
                tono={completados === TODOS_LOS_CAMPOS.length ? 'ok' : 'aviso'}
              />
              <FilaEstado
                icon={Globe}
                label="Zona horaria"
                value={guardado.timeZone || 'La del servidor'}
                tono={guardado.timeZone ? 'ok' : 'aviso'}
              />
              <FilaEstado
                icon={FileText}
                label="Documentación"
                value={
                  resumenDocs
                    ? resumenDocs.total === 0
                      ? 'Sin documentos'
                      : [
                          `${resumenDocs.activos} en uso`,
                          resumenDocs.pendientes > 0 ? `${resumenDocs.pendientes} por revisar` : '',
                          resumenDocs.fallidos > 0 ? `${resumenDocs.fallidos} con error` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                    : '—'
                }
                tono={
                  resumenDocs && (resumenDocs.pendientes > 0 || resumenDocs.fallidos > 0)
                    ? 'aviso'
                    : resumenDocs && resumenDocs.activos > 0
                      ? 'ok'
                      : 'neutro'
                }
              />
              <FilaEstado
                icon={Braces}
                label="Contexto por mensaje"
                value={
                  resumenContexto
                    ? `${resumenContexto.aproximado ? '~' : ''}${resumenContexto.tokens.toLocaleString('es')} tokens · ${resumenContexto.fragmentos} fragmento${resumenContexto.fragmentos === 1 ? '' : 's'}`
                    : '—'
                }
              />
              <FilaEstado
                icon={Clock}
                label="Última vez guardado"
                value={updatedAt ? new Date(updatedAt).toLocaleString('es') : 'Todavía sin configurar'}
                tono={updatedAt ? 'neutro' : 'aviso'}
              />
            </section>

            <section className="reveal kpi-card">
              <div className="sec-head">
                <span className="sec-head__eyebrow">Acciones</span>
                <h3 className="sec-head__title font-display">Atajos</h3>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="sec"
                  fullWidth
                  className="!justify-start"
                  onClick={() => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <Play size={15} strokeWidth={2.25} /> Probar el agente
                </Button>
                <Button
                  variant="sec"
                  fullWidth
                  className="!justify-start"
                  onClick={() => setContextKey((k) => k + 1)}
                >
                  <RefreshCw size={15} strokeWidth={2.25} /> Actualizar contexto
                </Button>
                {isOwner && (
                  <Button
                    type="submit"
                    form="perfil-agente"
                    fullWidth
                    className="!justify-start"
                    disabled={saving || !hayCambios}
                  >
                    <Save size={15} strokeWidth={2.25} />
                    {saving ? 'Guardando…' : hayCambios ? 'Guardar cambios' : 'Todo guardado'}
                  </Button>
                )}
              </div>
              {hayCambios && (
                <p className="mt-3 text-[12px] text-warn">Hay cambios sin guardar en la configuración.</p>
              )}
            </section>
          </div>

          {/* ---- Fila 2: las dos configuraciones, una al lado de la otra ---- */}
          <form id="perfil-agente" onSubmit={save}>
            <div className="grid-1-1">
              <section className="reveal kpi-card">
                <div className="sec-head">
                  <span className="sec-head__eyebrow">Configuración</span>
                  <h3 className="sec-head__title font-display">El negocio</h3>
                </div>
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
                {CAMPOS_NEGOCIO.map(campo)}
              </section>

              <section className="reveal kpi-card">
                <div className="sec-head">
                  <span className="sec-head__eyebrow">Configuración</span>
                  <h3 className="sec-head__title font-display">Cómo habla el agente</h3>
                </div>
                {CAMPOS_AGENTE.map(campo)}
              </section>
            </div>

            {isOwner && (
              // El pie se queda pegado al fondo mientras se edita: las dos
              // columnas son largas y, sin esto, el botón de guardar quedaba
              // fuera de pantalla en cuanto tocabas el primer campo.
              <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-[var(--surface-glass)] px-5 py-3.5 backdrop-blur">
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

          {/* ---- Filas 3, 4 y 5: documentación, contexto y pruebas ---- */}
          <KnowledgeDocuments
            isOwner={isOwner}
            onChanged={() => setContextKey((k) => k + 1)}
            onResumen={setResumenDocs}
          />
          <AiContextPanel reloadKey={contextKey} onResumen={setResumenContexto} />
          <div ref={chatRef}>
            <AiTestChat isOwner={isOwner} />
          </div>
        </div>
      )}
    </div>
  );
}
