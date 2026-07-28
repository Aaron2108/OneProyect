import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Plus, TriangleAlert, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useRecurso } from '@/lib/use-recurso';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { Pill } from '@/components/ui/Pill';
import type { TeamMember, UserRole } from '@/lib/types';

export function TeamPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [error, setError] = useState('');
  const [gridRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });

  // `errorCarga` va separado del error del formulario: sirve para no enseñar
  // "aún no hay más miembros" cuando la rejilla está vacía porque la petición
  // falló. Mientras carga, `datos` es null y la rejilla sale vacía, igual que
  // antes.
  const {
    datos,
    error: errorCarga,
    recargar,
  } = useRecurso<TeamMember[]>('/users', 'No se pudo cargar el equipo');
  const items = datos ?? [];

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
      void recargar();
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
          // La etiqueta sigue al estado, igual que en Contactos: el botón abría
          // y cerraba el formulario diciendo siempre lo mismo.
          <Button size="sm" variant={inviting ? 'sec' : 'brand'} onClick={() => setInviting((s) => !s)}>
            {inviting ? (
              'Cancelar'
            ) : (
              <>
                <Plus size={15} strokeWidth={2.25} /> Invitar miembro
              </>
            )}
          </Button>
        )}
      </div>

      {user?.role === 'OWNER' && inviting && (
        <form onSubmit={invite} className="mb-6 flex flex-wrap items-end gap-3 kpi-card">
          {error && <div role="alert" className="w-full rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">{error}</div>}
          {/* `aria-label` y no una etiqueta visible: el placeholder desaparece al
              escribir y un lector de pantalla solo anunciaba "cuadro de edición".
              Poner un <Label> encima cambiaría el diseño del formulario. */}
          <div className="min-w-[140px] flex-1">
            {/* Igual que en Contactos: el formulario aparecía y el foco se
                quedaba en el botón que lo abrió. */}
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" aria-label="Nombre" />
          </div>
          <div className="min-w-[160px] flex-1">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" />
          </div>
          <div className="min-w-[170px] flex-1">
            {/* «Contraseña» a secas no dice de quién ni para qué: es la que
                usará esa persona para entrar la primera vez, no la tuya. */}
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña inicial (mín. 8)"
              aria-label="Contraseña inicial"
              autoComplete="new-password"
            />
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} aria-label="Rol" className="w-auto flex-shrink-0">
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
        {/* Los dos estados estaban escritos a mano aquí, así que eran los
            únicos del panel sin el tratamiento de `EmptyState` —el icono con
            su halo, el título y el texto—: la misma situación se veía de una
            forma en Equipo y de otra en las otras seis pantallas. */}
        {items.length === 0 && (
          <div className="col-span-full">
            {errorCarga ? (
              <EmptyState
                icon={TriangleAlert}
                title="No se pudo cargar el equipo"
                description={errorCarga}
                action={
                  <Button size="sm" variant="ghost" onClick={() => void recargar()}>
                    Reintentar
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={UserPlus}
                title="Solo estás tú"
                description="Invita a quien vaya a atender conversaciones contigo."
                action={
                  user?.role === 'OWNER' ? (
                    <Button size="sm" onClick={() => setInviting(true)}>
                      <Plus size={15} strokeWidth={2.25} /> Invitar al primero
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
