import { motion } from 'framer-motion';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Label } from '@/components/ui/Input';
import type { AuthResult } from '@/lib/types';
import { HeroDemo } from './HeroDemo';

/** Decodifica el AuthResult que el backend deja en el fragmento de la URL tras "Continuar con Google" (ver GoogleAuthController.callback). */
function decodeGoogleAuthResult(base64url: string): AuthResult {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded)) as AuthResult;
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
      try {
        loginWithResult(decodeGoogleAuthResult(params.get('googleAuth')!));
      } catch {
        toast.show('No se pudo completar el inicio de sesión con Google', 'error');
      }
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
            className="m-0 max-w-[34ch] text-base text-[#b9d8cb]"
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
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em]" style={{ color: '#7be8bf' }}>
            {isRegister ? 'Empieza gratis' : 'Bienvenido de vuelta'}
          </p>
          <h2 className="mb-1 font-display text-[27px] font-bold tracking-tight" style={{ color: '#eaf3ee' }}>
            {isRegister ? 'Crea tu empresa' : 'Entra a tu panel'}
          </h2>
          <p className="mb-6 text-[14.5px]" style={{ color: '#9fb3aa' }}>
            {isRegister
              ? 'Tu empleado digital de WhatsApp listo en un minuto.'
              : 'Gestiona tus conversaciones de WhatsApp en un solo lugar.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-3.5 animate-[popIn_.25s_var(--ease-out)] rounded-sm px-3.5 py-2.5 text-[13.5px]"
              style={{ background: 'rgba(255,131,131,.16)', color: '#ff8383' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="auth-form-dark">
            {isRegister && (
              <>
                <Field>
                  <Label htmlFor="f_tenant" style={{ color: '#9fb3aa' }}>
                    Nombre de tu empresa
                  </Label>
                  <Input
                    id="f_tenant"
                    placeholder="Mi Negocio"
                    autoComplete="organization"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    style={AUTH_INPUT_STYLE}
                  />
                </Field>
                <Field>
                  <Label htmlFor="f_name" style={{ color: '#9fb3aa' }}>
                    Tu nombre
                  </Label>
                  <Input
                    id="f_name"
                    placeholder="¿Cómo te llamas?"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={AUTH_INPUT_STYLE}
                  />
                </Field>
              </>
            )}
            <Field>
              <Label htmlFor="f_email" style={{ color: '#9fb3aa' }}>
                Email
              </Label>
              <Input
                id="f_email"
                type="email"
                placeholder="tu@empresa.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={AUTH_INPUT_STYLE}
              />
            </Field>
            <Field>
              <Label htmlFor="f_pass" style={{ color: '#9fb3aa' }}>
                Contraseña
              </Label>
              <Input
                id="f_pass"
                type="password"
                placeholder="Mínimo 8 caracteres"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={AUTH_INPUT_STYLE}
              />
            </Field>
            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={loading}
              className="!bg-[linear-gradient(135deg,#2ee6a6,#17a67f)] !text-[#06231a] !shadow-[0_8px_24px_-8px_rgba(46,230,166,.5)] hover:brightness-105"
            >
              {isRegister ? 'Crear mi empresa' : 'Entrar'}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3" style={{ color: '#6d8177' }}>
            <span className="h-px flex-1" style={{ background: 'rgba(255,255,255,.12)' }} />
            <span className="text-xs">o</span>
            <span className="h-px flex-1" style={{ background: 'rgba(255,255,255,.12)' }} />
          </div>

          <Button
            type="button"
            variant="ghost"
            fullWidth
            loading={googleLoading}
            disabled={googleLoading}
            onClick={continueWithGoogle}
            className="!border-[rgba(255,255,255,.2)] !text-[#eaf3ee] hover:!border-[#7be8bf] hover:!text-[#7be8bf]"
          >
            <span aria-hidden="true" className="font-bold">G</span> Continuar con Google
          </Button>

          <p className="mt-4 text-center text-sm" style={{ color: '#9fb3aa' }}>
            {isRegister ? '¿Ya tienes cuenta? ' : '¿Aún no tienes cuenta? '}
            <a
              role="button"
              tabIndex={0}
              onClick={() => setMode(isRegister ? 'login' : 'register')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setMode(isRegister ? 'login' : 'register')}
              className="cursor-pointer font-semibold"
              style={{ color: '#7be8bf' }}
            >
              {isRegister ? 'Inicia sesión' : 'Crea tu empresa'}
            </a>
          </p>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs" style={{ color: '#7e9188' }}>
            🔒 Conexión oficial con la Meta Cloud API de WhatsApp
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

const AUTH_INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,.07)',
  borderColor: 'rgba(255,255,255,.2)',
  color: '#eaf3ee',
};
