import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';
import { AuthPage } from '@/features/auth/AuthPage';
import { AppShell } from '@/components/layout/AppShell';

function Root(): JSX.Element {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppShell /> : <AuthPage />;
}

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <AuthProvider>
        {/* El router envuelve todo, no solo el panel: `AuthPage` no tiene rutas
            hoy, pero dejarlo fuera obligaría a moverlo el día que las tenga. */}
        <BrowserRouter>
          <Root />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
