import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Plus, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Pill } from '@/components/ui/Pill';
import type { TeamMember, UserRole } from '@/lib/types';

export function TeamPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<TeamMember[]>([]);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [error, setError] = useState('');
  const [gridRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });

  async function load(): Promise<void> {
    setItems(await api<TeamMember[]>('/users'));
  }
  useEffect(() => {
    void load();
  }, []);

  async function invite(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setError('');
    try {
      await api('/users', { method: 'POST', body: { name: name.trim(), email: email.trim(), password, role } });
      setName('');
      setEmail('');
      setPassword('');
      setInviting(false);
      toast.show('Miembro añadido');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo invitar');
    }
  }

  return (
    <div className="mx-auto max-w-[920px] p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Equipo</h2>
          <p className="m-0 text-sm text-ink-soft">Las personas de tu empresa que atienden conversaciones.</p>
        </div>
        {user?.role === 'OWNER' && (
          <Button size="sm" onClick={() => setInviting((s) => !s)}>
            <Plus size={15} strokeWidth={2.25} /> Invitar miembro
          </Button>
        )}
      </div>

      {user?.role === 'OWNER' && inviting && (
        <form onSubmit={invite} className="mb-6 flex flex-wrap items-end gap-3 kpi-card">
          {error && <div role="alert" className="w-full rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">{error}</div>}
          <div className="min-w-[140px] flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="min-w-[160px] flex-1">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          </div>
          <div className="min-w-[170px] flex-1">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña (mín. 8)" autoComplete="new-password" />
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-auto flex-shrink-0">
            <option value="AGENT">Agente</option>
            <option value="OWNER">Propietario</option>
          </Select>
          <Button type="submit">Invitar</Button>
        </form>
      )}

      <div ref={gridRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((u) => (
          <div key={u.id} className="kpi-card flex flex-col items-center gap-3 text-center">
            <Avatar name={u.name} phone={u.email} seed={u.id} size={56} />
            <div>
              <div className="text-[14.5px] font-bold">{u.name}</div>
              <div className="mt-0.5 truncate font-mono text-[12px] text-ink-soft">{u.email}</div>
            </div>
            <Pill kind={u.role === 'OWNER' ? 'owner' : 'agent'} />
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-2 py-10 text-center text-ink-disabled">
            <UserPlus size={26} strokeWidth={1.75} />
            <p className="m-0 text-sm">Aún no hay más miembros en el equipo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
