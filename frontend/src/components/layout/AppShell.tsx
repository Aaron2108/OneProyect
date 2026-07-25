import * as RadixTabs from '@radix-ui/react-tabs';
import { Bot, Calendar, Contact, LayoutGrid, MessageSquare, Package, Users, type LucideIcon } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { ProfileDialog } from '@/features/account/ProfileDialog';
import { InboxPage } from '@/features/inbox/InboxPage';
import { ContactsPage } from '@/features/contacts/ContactsPage';
import { TeamPage } from '@/features/team/TeamPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { AiAgentPage } from '@/features/ai-agent/AiAgentPage';
import { ProductsPage } from '@/features/products/ProductsPage';

// Recharts es el mayor contribuyente al peso del bundle; se carga solo cuando
// se visita Métricas (no es la primera pantalla tras entrar) en vez de en el
// bundle inicial de Bandeja/Login.
const MetricsPage = lazy(() => import('@/features/metrics/MetricsPage').then((m) => ({ default: m.MetricsPage })));

const TABS: Array<{ value: string; label: string; icon: LucideIcon }> = [
  { value: 'inbox', label: 'Bandeja', icon: MessageSquare },
  { value: 'metrics', label: 'Métricas', icon: LayoutGrid },
  { value: 'contacts', label: 'Contactos', icon: Contact },
  { value: 'calendar', label: 'Calendario', icon: Calendar },
  { value: 'products', label: 'Productos', icon: Package },
  { value: 'agent', label: 'Agente IA', icon: Bot },
  { value: 'team', label: 'Equipo', icon: Users },
];

export function AppShell(): JSX.Element {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('inbox');
  const [profileOpen, setProfileOpen] = useState(false);
  const pageTitle = useMemo(() => TABS.find((t) => t.value === tab)?.label ?? '', [tab]);

  return (
    <RadixTabs.Root value={tab} onValueChange={setTab} orientation="vertical" className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__glyph">W</span>
          WhatsFlow&nbsp;AI
        </div>

        <RadixTabs.List className="app-sidebar__nav" aria-label="Secciones">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <RadixTabs.Trigger key={t.value} value={t.value} className="app-sidebar__item">
                <Icon size={17} strokeWidth={2} />
                {t.label}
              </RadixTabs.Trigger>
            );
          })}
        </RadixTabs.List>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
          <RadixTabs.Content value="inbox" className="h-full data-[state=inactive]:hidden" forceMount>
            <InboxPage active={tab === 'inbox'} />
          </RadixTabs.Content>
          <RadixTabs.Content value="metrics" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
            <Suspense fallback={null}>
              <MetricsPage active={tab === 'metrics'} />
            </Suspense>
          </RadixTabs.Content>
          <RadixTabs.Content value="contacts" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
            <ContactsPage active={tab === 'contacts'} />
          </RadixTabs.Content>
          <RadixTabs.Content value="calendar" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
            <CalendarPage active={tab === 'calendar'} />
          </RadixTabs.Content>
          <RadixTabs.Content value="products" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
            <ProductsPage active={tab === 'products'} />
          </RadixTabs.Content>
          <RadixTabs.Content value="agent" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
            <AiAgentPage active={tab === 'agent'} />
          </RadixTabs.Content>
          <RadixTabs.Content value="team" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
            <TeamPage active={tab === 'team'} />
          </RadixTabs.Content>
        </main>
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </RadixTabs.Root>
  );
}
