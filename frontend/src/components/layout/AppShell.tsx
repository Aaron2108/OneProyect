import { Bot, Calendar, Contact, LayoutGrid, MessageSquare, Package, Users, type LucideIcon } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
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
 * Las secciones del panel, cada una con su URL.
 *
 * Antes eran pestañas guardadas en un `useState`: no se podía enlazar una
 * sección, el botón "atrás" del navegador no hacía nada y al recargar siempre
 * se volvía a Bandeja. Las rutas van en español porque son visibles para el
 * usuario, igual que el resto de la interfaz.
 */
const SECCIONES: Array<{ path: string; label: string; icon: LucideIcon }> = [
  { path: '/bandeja', label: 'Bandeja', icon: MessageSquare },
  { path: '/metricas', label: 'Métricas', icon: LayoutGrid },
  { path: '/contactos', label: 'Contactos', icon: Contact },
  { path: '/calendario', label: 'Calendario', icon: Calendar },
  { path: '/productos', label: 'Productos', icon: Package },
  { path: '/agente', label: 'Agente IA', icon: Bot },
  { path: '/equipo', label: 'Equipo', icon: Users },
];

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
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const pageTitle = useTituloDeSeccion();
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__glyph">W</span>
          WhatsFlow&nbsp;AI
        </div>

        <nav className="app-sidebar__nav" aria-label="Secciones">
          {SECCIONES.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              // NavLink marca la sección activa por la URL, no por un estado
              // paralelo que se pueda desincronizar de ella.
              className={({ isActive }) => 'app-sidebar__item'.concat(isActive ? ' is-active' : '')}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* `min-h-0` además de `min-w-0`: en móvil el armazón se apila en
          columna, y un elemento flex no baja de la altura de su contenido
          mientras su `min-height` valga `auto`. Sin esto, el panel medía lo que
          midiera la página y empujaba la barra de navegación 2.000 píxeles por
          debajo del borde de la pantalla. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="app-topbar">
          <h1 className="font-display text-[15.5px] font-bold tracking-tight">{pageTitle}</h1>
          <div className="flex-1" />
          <div className="status-pill">
            <span className="status-pill__dot" />
            Todo operativo
          </div>

          <div className="ml-3 flex-shrink-0">
            <DropdownMenu
              trigger={
                <button className="ml-1 flex items-center gap-2.5 rounded-sm border border-transparent px-1.5 py-1 leading-tight transition-colors duration-fast hover:border-line-strong hover:bg-[var(--hover-bg)] sm:px-2">
                  <span className="hidden flex-col items-end sm:flex">
                    <b className="text-[13.5px] font-semibold">{user?.name}</b>
                    <span className="text-[11.5px] text-ink-faint">{user?.email}</span>
                  </span>
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-brand-tint text-[12.5px] font-bold text-brand">
                    {(user?.name || '?').charAt(0).toUpperCase()}
                  </span>
                </button>
              }
              items={[
                { label: 'Mi cuenta', onSelect: () => setProfileOpen(true) },
                { label: 'Salir', onSelect: logout, danger: true },
              ]}
            />
          </div>
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
