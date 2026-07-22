import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field, Input, Label } from '@/components/ui/Input';
import { HeroDemo } from './HeroDemo';

type Mode = 'login' | 'register';

const HEADLINE = [
  { text: 'Tu empleado', accent: false },
  { text: 'digital que', accent: false },
  { text: 'nunca deja un', accent: true },
  { text: 'mensaje sin', accent: true },
  { text: 'responder.', accent: true },
];

export function AuthPage(): JSX.Element {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isRegister = mode === 'register';

  const [tenantName, setTenantName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
    </div>
  );
}

const AUTH_INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,.07)',
  borderColor: 'rgba(255,255,255,.2)',
  color: '#eaf3ee',
};
