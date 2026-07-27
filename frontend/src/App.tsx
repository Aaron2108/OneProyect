import { MotionConfig } from 'framer-motion';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';
import { AuthPage } from '@/features/auth/AuthPage';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';

function Root(): JSX.Element {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppShell /> : <AuthPage />;
}

export default function App(): JSX.Element {
  return (
    // La frontera va por fuera de los proveedores: si revienta el propio
    // ToastProvider o la sesión guardada, sigue habiendo algo que enseñar. Su
    // fallback no depende de ningún contexto, precisamente por eso.
    <ErrorBoundary>
      {/* `reducedMotion="user"` respeta la preferencia del sistema: a quien pide
          menos movimiento (por mareo o por migraña, no por gusto) Framer Motion
          le anula desplazamientos y escalados, y le deja solo las transiciones de
          opacidad. Para el resto no cambia nada. */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <AuthProvider>
            {/* El router envuelve todo, no solo el panel: `AuthPage` no tiene rutas
                hoy, pero dejarlo fuera obligaría a moverlo el día que las tenga. */}
            <BrowserRouter>
              <Root />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
