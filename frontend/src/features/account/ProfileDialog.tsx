import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Label } from '@/components/ui/Input';

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError('');
    }
  }, [open]);

  async function save(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setError('');
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (next !== confirm) return setError('Las contraseñas nuevas no coinciden.');
    setSaving(true);
    try {
      await changePassword(current, next);
      onOpenChange(false);
      toast.show('Contraseña actualizada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mi cuenta"
      description="Tus datos y el cambio de contraseña."
      footer={
        <>
          <Button variant="sec" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {/* `type="submit"` con `form`: el botón vive fuera del formulario
              (está en el pie del diálogo) pero lo envía igual. */}
          <Button variant="brand" type="submit" form="mi-cuenta-form" loading={saving}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      {/* Quién eres, como contenido y no como subtítulo.
          El diálogo se llama «Mi cuenta» y lo único que había dentro era el
          cambio de contraseña; tu nombre y tu correo iban en la línea gris de
          debajo del título, del tamaño de un pie de foto. Ahora el título dice
          la verdad. */}
      {user && (
        <div className="mb-5 flex items-center gap-3 rounded-sm border border-line bg-[var(--row-hover)] px-3.5 py-3">
          <Avatar name={user.name} phone={user.email} seed={user.id} size={40} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold">{user.name}</div>
            <div className="truncate font-mono text-[12px] text-ink-soft">{user.email}</div>
          </div>
        </div>
      )}

      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-disabled">Contraseña</div>

      {error && (
        <div role="alert" className="mb-3.5 rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </div>
      )}
      {/* Un <form> de verdad: eran tres campos de contraseña y un botón suelto
          con `onClick`, así que pulsar Intro dentro de cualquiera de ellos no
          hacía nada. En un diálogo de contraseña es justo lo que se espera. */}
      <form id="mi-cuenta-form" onSubmit={save}>
        <Field>
          <Label htmlFor="pm_cur">Contraseña actual</Label>
          <Input id="pm_cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="pm_new">Nueva contraseña</Label>
          <Input id="pm_new" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="pm_new2">Repite la nueva</Label>
          <Input id="pm_new2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
