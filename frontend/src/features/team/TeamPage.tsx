import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import type { TeamMember, UserRole } from '@/lib/types';

export function TeamPage({ active }: { active: boolean }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<TeamMember[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [error, setError] = useState('');
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });

  async function load(): Promise<void> {
    setItems(await api<TeamMember[]>('/users'));
  }
  useEffect(() => {
    if (active) void load();
  }, [active]);

  async function invite(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setError('');
    try {
      await api('/users', { method: 'POST', body: { name: name.trim(), email: email.trim(), password, role } });
      setName('');
      setEmail('');
      setPassword('');
      toast.show('Miembro añadido');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo invitar');
    }
  }

  return (
    <div className="mx-auto max-w-[780px] p-5 sm:p-10">
      <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Equipo</h2>
      <p className="mb-4 text-sm text-ink-soft">Las personas de tu empresa que atienden conversaciones. Solo el propietario puede invitar a nuevos miembros.</p>

      {user?.role === 'OWNER' && (
        <>
          {error && (
            <div role="alert" className="mb-4 rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">
              {error}
            </div>
          )}
          <form onSubmit={invite} className="mb-5 flex flex-wrap gap-2.5 rounded bg-surface p-3.5 shadow-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              className="min-w-[130px] flex-1 rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="min-w-[130px] flex-1 rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña (mín. 8)"
              autoComplete="new-password"
              className="min-w-[150px] flex-1 rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5 focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-tint)] focus:outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="rounded-sm border border-line-strong bg-[var(--input-bg)] px-3 py-2.5"
            >
              <option value="AGENT">Agente</option>
              <option value="OWNER">Propietario</option>
            </select>
            <Button type="submit" variant="brand">
              Invitar
            </Button>
          </form>
        </>
      )}

      <div className="overflow-hidden rounded bg-surface shadow-1">
        <div ref={listRef}>
          {items.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <Avatar name={u.name} phone={u.email} seed={u.id} size={36} />
              <div>
                <div className="text-[14.5px] font-semibold">{u.name}</div>
                <div className="font-mono text-[13px] text-ink-soft">{u.email}</div>
              </div>
              <span className="ml-auto">
                <Pill kind={u.role === 'OWNER' ? 'owner' : 'agent'} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
