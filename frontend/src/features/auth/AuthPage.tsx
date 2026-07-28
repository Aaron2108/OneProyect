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
import { decodeGoogleAuthResult } from './auth.util';
import { HeroDemo } from './HeroDemo';

function clearUrlHash(): void {
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
}

type Mode = 'login' | 'register';

/**
 * El titular, línea a línea, porque cada una entra por separado.
 *
 * El acento cubría las tres últimas líneas: más de la mitad del bloque en
 * verde: y a esa escala el color de marca dejaba de señalar nada, era el fondo
 * del titular. Ahora cae solo en la palabra donde aterriza la frase, que es lo
 * que el producto promete.
 */
const HEADLINE = [
  { text: 'Tu empleado', accent: false },
  { text: 'digital que', accent: false },
  { text: 'nunca deja un', accent: false },
  { text: 'mensaje sin', accent: false },
  { text: 'responder.', accent: true },
];

/**
 * La G de Google, con sus cuatro colores.
 *
 * Es la única marca ajena del panel y por eso no sale de Lucide (que no tiene
 * logotipos) ni puede recolorearse: las condiciones de "Iniciar sesión con
 * Google" exigen el símbolo tal cual. Antes había una «G» en negrita con la
 * tipografía de la interfaz, que no es el logotipo de nadie y se leía como un
 * hueco sin terminar justo debajo del botón principal.
 */
function GoogleMark(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

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

        <div className="auth-hero__body">
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
        </div>
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
            <GoogleMark /> Continuar con Google
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
