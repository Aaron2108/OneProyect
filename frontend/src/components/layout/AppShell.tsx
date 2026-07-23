import * as RadixTabs from '@radix-ui/react-tabs';
import { motion } from 'framer-motion';
import { lazy, Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { ProfileDialog } from '@/features/account/ProfileDialog';
import { InboxPage } from '@/features/inbox/InboxPage';
import { ContactsPage } from '@/features/contacts/ContactsPage';
import { TeamPage } from '@/features/team/TeamPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { AiAgentPage } from '@/features/ai-agent/AiAgentPage';

// Recharts es el mayor contribuyente al peso del bundle; se carga solo cuando
// se visita Métricas (no es la primera pantalla tras entrar) en vez de en el
// bundle inicial de Bandeja/Login.
const MetricsPage = lazy(() => import('@/features/metrics/MetricsPage').then((m) => ({ default: m.MetricsPage })));

const TABS = [
  { value: 'inbox', label: 'Bandeja' },
  { value: 'metrics', label: 'Métricas' },
  { value: 'contacts', label: 'Contactos' },
  { value: 'calendar', label: 'Calendario' },
  { value: 'agent', label: 'Agente IA' },
  { value: 'team', label: 'Equipo' },
];

export function AppShell(): JSX.Element {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('inbox');
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <RadixTabs.Root value={tab} onValueChange={setTab} className="flex h-full flex-col">
      <header className="app-topbar flex h-[58px] flex-shrink-0 items-center gap-2 overflow-x-auto px-3 sm:gap-4 sm:px-4">
        <div className="flex flex-shrink-0 items-center gap-2 font-display text-[15px] font-bold tracking-tight sm:gap-2.5 sm:text-[16.5px]">
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg font-display text-[15px] font-extrabold text-[#06231a] shadow-[0_2px_10px_rgba(46,230,166,.35)]" style={{ background: 'linear-gradient(150deg, var(--brand), var(--ai))' }}>
            W
          </span>
          <span className="hidden sm:inline">WhatsFlow&nbsp;AI</span>
        </div>

        <RadixTabs.List className="ml-1 flex flex-shrink-0 gap-0.5 sm:ml-1.5" aria-label="Secciones">
          {TABS.map((t) => (
            <RadixTabs.Trigger
              key={t.value}
              value={t.value}
              className="relative whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-semibold text-ink-soft outline-none transition-colors hover:text-ink data-[state=active]:text-brand-700 sm:px-3.5 sm:text-sm"
            >
              {tab === t.value && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-lg bg-brand-tint"
                  transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>

        <div className="flex-1" />
        <div className="flex-shrink-0">
          <ThemeToggle />
        </div>

        <div className="flex-shrink-0">
          <DropdownMenu
            trigger={
              <button className="ml-1 flex items-center gap-2 rounded-lg px-1.5 py-1 leading-tight transition-colors hover:bg-[var(--hover-bg)] sm:px-2">
                <span className="hidden flex-col items-end sm:flex">
                  <b className="text-[13.5px] font-semibold">{user?.name}</b>
                  <span className="text-[11.5px] text-ink-faint">{user?.email}</span>
                </span>
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand-tint text-[12px] font-bold text-brand-700 sm:hidden">
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
        <RadixTabs.Content value="agent" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
          <AiAgentPage active={tab === 'agent'} />
        </RadixTabs.Content>
        <RadixTabs.Content value="team" className="h-full overflow-y-auto data-[state=inactive]:hidden" forceMount>
          <TeamPage active={tab === 'team'} />
        </RadixTabs.Content>
      </main>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </RadixTabs.Root>
  );
}
