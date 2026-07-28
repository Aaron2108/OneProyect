import { Menu } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Sidebar } from '@/components/layout/Sidebar';
import { SECCIONES } from '@/components/layout/secciones';
import { ProfileDialog } from '@/features/account/ProfileDialog';
// La bandeja es la pantalla de trabajo y la primera que se ve: va en el bundle
// inicial. El resto se carga al entrar en su ruta — quien abre el panel para
// contestar mensajes no debería descargar el calendario, el catálogo y los
// gráficos que quizá no visite. Recharts (Métricas) es el más pesado con
// diferencia.
import { InboxPage } from '@/features/inbox/InboxPage';

const MetricsPage = lazy(() => import('@/features/metrics/MetricsPage').then((m) => ({ default: m.MetricsPage })));
const ContactsPage = lazy(() => import('@/features/contacts/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const TeamPage = lazy(() => import('@/features/team/TeamPage').then((m) => ({ default: m.TeamPage })));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const AiAgentPage = lazy(() => import('@/features/ai-agent/AiAgentPage').then((m) => ({ default: m.AiAgentPage })));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })));

/**
 * Contenedor con scroll de cada sección.
 *
 * `main` no puede desplazarse (`overflow-hidden`) porque la bandeja necesita
 * que sus tres columnas se desplacen por separado. Las demás páginas son una
 * columna larga y sí necesitan su propio scroll: sin esto, el contenido se
 * corta y la rueda del ratón no hace nada.
 */
function Desplazable({ children }: { children: ReactNode }): JSX.Element {
  return <div className="h-full overflow-y-auto">{children}</div>;
}

/** Título de la barra superior, derivado de la URL. */
function useTituloDeSeccion(): string {
  const { pathname } = useLocation();
  return SECCIONES.find((s) => pathname.startsWith(s.path))?.label ?? '';
}

export function AppShell(): JSX.Element {
  const [profileOpen, setProfileOpen] = useState(false);
  const [navAbierta, setNavAbierta] = useState(false);
  const pageTitle = useTituloDeSeccion();
  const { pathname } = useLocation();

  // Red de seguridad para el cajón de móvil: aunque se navegue sin tocar un
  // enlace suyo (el botón "atrás", una redirección), no se queda abierto sobre
  // la pantalla nueva.
  useEffect(() => setNavAbierta(false), [pathname]);

  return (
    <div className="app-shell">
      <Sidebar
        cajonAbierto={navAbierta}
        onCajon={setNavAbierta}
        onAbrirPerfil={() => setProfileOpen(true)}
      />

      {/* `min-h-0` además de `min-w-0`: un elemento flex no baja de la altura
          de su contenido mientras su `min-height` valga `auto`, y entonces el
          panel mide lo que mida la página en vez de lo que mide la ventana. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="app-topbar">
          <button
            type="button"
            className="app-topbar__menu"
            onClick={() => setNavAbierta(true)}
            aria-label="Abrir la navegación"
          >
            <Menu size={19} strokeWidth={2} />
          </button>
          <h1 className="font-display text-[15.5px] font-bold tracking-tight">{pageTitle}</h1>
        </header>

        <main className="flex-1 overflow-hidden">
          {/* Segunda frontera, por dentro del armazón: si revienta una página, se
              cae solo el contenido y quedan la barra lateral y la superior para
              irse a otra sección. Al cambiar de ruta se descarta el error. */}
          <ErrorBoundary claveReinicio={pathname}>
            {/* Un solo Suspense para todas: cada ruta perezosa necesita uno, y
                repetirlo por página solo añadiría ruido. Con `null` de relleno,
                una conexión lenta dejaba el área de contenido en blanco y sin
                señal de que algo estuviera pasando — Métricas arrastra Recharts,
                que es el chunk más pesado con diferencia. */}
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                {/* La bandeja ocupa el alto completo y reparte el scroll entre
                    sus columnas; no lleva envoltorio con scroll propio. */}
                <Route path="/bandeja" element={<div className="h-full"><InboxPage /></div>} />
                {/* La conversación abierta va en la URL: así se puede enlazar una
                    conversación concreta y el botón "atrás" cierra el hilo. */}
                <Route
                  path="/bandeja/:conversationId"
                  element={<div className="h-full"><InboxPage /></div>}
                />
                <Route path="/metricas" element={<Desplazable><MetricsPage /></Desplazable>} />
                <Route path="/contactos" element={<Desplazable><ContactsPage /></Desplazable>} />
                <Route path="/calendario" element={<Desplazable><CalendarPage /></Desplazable>} />
                <Route path="/productos" element={<Desplazable><ProductsPage /></Desplazable>} />
                <Route path="/agente" element={<Desplazable><AiAgentPage /></Desplazable>} />
                <Route path="/equipo" element={<Desplazable><TeamPage /></Desplazable>} />
                {/* Cualquier otra cosa cae en la bandeja, que es la pantalla de
                    trabajo. `replace` para no dejar basura en el historial. */}
                <Route path="*" element={<Navigate to="/bandeja" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
