import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Label } from '@/components/ui/Input';
import type { AuthResult } from '@/lib/types';
import { HeroDemo } from './HeroDemo';

function esCadena(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Comprueba la forma de lo que viene en la URL antes de darlo por bueno.
 *
 * Lo que llega en el fragmento lo escribe el backend, pero por el camino lo
 * puede poner cualquiera: basta un enlace preparado para que el panel guarde un
 * token y un usuario inventados y se comporte como si hubiera sesión. `as
 * AuthResult` no comprobaba nada — solo silenciaba a TypeScript.
 *
 * No valida la firma del token (eso solo puede hacerlo el servidor, que la
 * vuelve a exigir en cada petición); valida que sea un JWT de tres segmentos y
 * que el usuario traiga los campos con los que el panel decide qué enseñar.
 */
function esAuthResult(x: unknown): x is AuthResult {
  if (!x || typeof x !== 'object') return false;
  const { accessToken, user } = x as { accessToken?: unknown; user?: unknown };
  if (!esCadena(accessToken)) return false;
  const partes = accessToken.split('.');
  if (partes.length !== 3 || partes.some((p) => p === '')) return false;
  if (!user || typeof user !== 'object') return false;
  const u = user as Record<string, unknown>;
  return (
    esCadena(u.id) &&
    esCadena(u.email) &&
    esCadena(u.name) &&
    esCadena(u.tenantId) &&
    (u.role === 'OWNER' || u.role === 'AGENT')
  );
}

/**
 * Decodifica el AuthResult que el backend deja en el fragmento de la URL tras
 * "Continuar con Google" (ver GoogleAuthController.callback). Devuelve `null` si
 * no es base64 válido, si no es JSON o si no tiene la forma esperada — quien
 * llama no debe persistir nada en ese caso.
 */
function decodeGoogleAuthResult(base64url: string): AuthResult | null {
  try {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const dato: unknown = JSON.parse(atob(padded));
    return esAuthResult(dato) ? dato : null;
  } catch {
    return null;
  }
}

function clearUrlHash(): void {
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
}

type Mode = 'login' | 'register';

const HEADLINE = [
  { text: 'Tu empleado', accent: false },
  { text: 'digital que', accent: false },
  { text: 'nunca deja un', accent: true },
  { text: 'mensaje sin', accent: true },
  { text: 'responder.', accent: true },
];

export function AuthPage(): JSX.Element {
  const { login, register, loginWithResult } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isRegister = mode === 'register';

  const [tenantName, setTenantName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleSignup, setGoogleSignup] = useState<{ token: string; email: string; name: string } | null>(null);
  const [googleTenantName, setGoogleTenantName] = useState('');
  const [googleSignupBusy, setGoogleSignupBusy] = useState(false);
  const [googleSignupError, setGoogleSignupError] = useState('');

  // El backend redirige aquí (GoogleAuthController.callback) con el resultado
  // en el fragmento de la URL — nunca en la query string, que sí viaja al servidor.
  function processGoogleParams(params: URLSearchParams): void {
    if (params.has('googleAuth')) {
      const resultado = decodeGoogleAuthResult(params.get('googleAuth')!);
      // Si no pasa la validación no se guarda ni el token ni el usuario: se
      // vuelve a la pantalla de entrada con el aviso.
      if (resultado) loginWithResult(resultado);
      else toast.show('No se pudo completar el inicio de sesión con Google', 'error');
    } else if (params.has('googleSignup')) {
      setGoogleSignup({
        token: params.get('googleSignup')!,
        email: params.get('email') ?? '',
        name: params.get('name') ?? '',
      });
    } else if (params.has('googleAuthError')) {
      toast.show('No se pudo conectar con Google', 'error');
    }
  }

  useEffect(() => {
    if (!window.location.hash) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    clearUrlHash();
    processGoogleParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) await register({ tenantName, name, email, password });
      else await login({ email, password });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo salió mal. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function continueWithGoogle(): Promise<void> {
    // Navegación completa (no popup): un popup exige comunicar el resultado
    // de vuelta entre ventanas, y las páginas de Google imponen
    // Cross-Origin-Opener-Policy — eso rompe, según el navegador, la
    // detección de la ventana, el cierre automático o el aviso por
    // `localStorage`. La navegación completa no depende de nada de eso: es
    // la misma ventana la que vuelve con el resultado.
    setGoogleLoading(true);
    try {
      const { url } = await api<{ url: string }>('/auth/google/start');
      window.location.href = url;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo iniciar sesión con Google', 'error');
      setGoogleLoading(false);
    }
  }

  async function completeGoogleSignup(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (!googleSignup) return;
    setGoogleSignupError('');
    setGoogleSignupBusy(true);
    try {
      const result = await api<AuthResult>('/auth/google/complete-signup', {
        method: 'POST',
        body: { token: googleSignup.token, tenantName: googleTenantName },
      });
      loginWithResult(result);
      setGoogleSignup(null);
    } catch (e) {
      setGoogleSignupError(e instanceof ApiError ? e.message : 'No se pudo crear la empresa');
    } finally {
      setGoogleSignupBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-hero">
        <div className="auth-hero__glow" />
        <div className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
          <span className="auth-glyph">W</span> WhatsFlow&nbsp;AI
        </div>

        <div className="max-w-[30ch]">
          <h1 className="mb-4 font-display text-[clamp(30px,4.4vw,46px)] font-bold leading-[1.04] tracking-tight">
            {HEADLINE.map((line, i) => (
              <span
                key={i}
                className={line.accent ? 'accent' : undefined}
                style={{ animationDelay: `${0.1 + i * 0.1}s` }}
              >
                {line.text}
              </span>
            ))}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="m-0 max-w-[34ch] text-base text-ink-soft"
          >
            La IA atiende tu WhatsApp con el contexto de tu negocio, agenda citas y le pasa el turno a tu equipo
            cuando hace falta.
          </motion.p>
        </div>

        <HeroDemo />
      </aside>

      <section className="auth-panel">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="auth-card"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-hover">
            {isRegister ? 'Empieza gratis' : 'Bienvenido de vuelta'}
          </p>
          <h2 className="mb-1 font-display text-[27px] font-bold tracking-tight text-ink">
            {isRegister ? 'Crea tu empresa' : 'Entra a tu panel'}
          </h2>
          <p className="mb-7 text-[14.5px] text-ink-soft">
            {isRegister
              ? 'Tu empleado digital de WhatsApp listo en un minuto.'
              : 'Gestiona tus conversaciones de WhatsApp en un solo lugar.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 animate-[popIn_.25s_var(--ease-out)] rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            {isRegister && (
              <>
                <Field>
                  <Label htmlFor="f_tenant">Nombre de tu empresa</Label>
                  <Input
                    id="f_tenant"
                    placeholder="Mi Negocio"
                    autoComplete="organization"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                  />
                </Field>
                <Field>
                  <Label htmlFor="f_name">Tu nombre</Label>
                  <Input
                    id="f_name"
                    placeholder="¿Cómo te llamas?"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field>
              <Label htmlFor="f_email">Email</Label>
              <Input
                id="f_email"
                type="email"
                placeholder="tu@empresa.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <Label htmlFor="f_pass">Contraseña</Label>
              <Input
                id="f_pass"
                type="password"
                placeholder="Mínimo 8 caracteres"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" fullWidth loading={loading} disabled={loading}>
              {isRegister ? 'Crear mi empresa' : 'Entrar'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-ink-disabled">
            <span className="h-px flex-1 bg-line-strong" />
            <span className="text-xs">o</span>
            <span className="h-px flex-1 bg-line-strong" />
          </div>

          <Button type="button" variant="ghost" fullWidth loading={googleLoading} disabled={googleLoading} onClick={continueWithGoogle}>
            <span aria-hidden="true" className="font-bold">G</span> Continuar con Google
          </Button>

          <p className="mt-5 text-center text-sm text-ink-soft">
            {isRegister ? '¿Ya tienes cuenta? ' : '¿Aún no tienes cuenta? '}
            {/* Un <button> y no un <a role="button">: el enlace no tenía href, así
                que no era enfocable de por sí ni se activaba con teclado sin
                emularlo a mano. El botón trae todo eso de fábrica y se anuncia
                como lo que es. El aspecto no cambia: Tailwind normaliza los
                botones para heredar tipografía y fondo. */}
            <button
              type="button"
              onClick={() => setMode(isRegister ? 'login' : 'register')}
              className="cursor-pointer font-semibold text-brand-hover"
            >
              {isRegister ? 'Inicia sesión' : 'Crea tu empresa'}
            </button>
          </p>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-disabled">
            <Lock size={12} strokeWidth={2} /> Conexión oficial con la Meta Cloud API de WhatsApp
          </p>
        </motion.div>
      </section>

      <Dialog
        open={!!googleSignup}
        onOpenChange={(open) => !open && setGoogleSignup(null)}
        title="Un último paso"
        description={`Vamos a crear tu empresa en WhatsFlow para ${googleSignup?.email ?? 'tu cuenta de Google'}.`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setGoogleSignup(null)}>
              Cancelar
            </Button>
            <Button type="submit" form="google-signup-form" loading={googleSignupBusy} disabled={googleSignupBusy}>
              Crear mi empresa
            </Button>
          </>
        }
      >
        {googleSignupError && (
          <div role="alert" className="mb-3.5 rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">
            {googleSignupError}
          </div>
        )}
        <form id="google-signup-form" onSubmit={completeGoogleSignup}>
          <Field>
            <Label htmlFor="f_google_tenant">Nombre de tu empresa</Label>
            <Input
              id="f_google_tenant"
              placeholder="Mi Negocio"
              autoComplete="organization"
              autoFocus
              value={googleTenantName}
              onChange={(e) => setGoogleTenantName(e.target.value)}
            />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
