import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
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

  async function save(): Promise<void> {
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
      description={user ? `${user.name} · ${user.email}` : undefined}
      footer={
        <>
          <Button variant="sec" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="brand" onClick={save} loading={saving}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-3.5 rounded-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </div>
      )}
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
    </Dialog>
  );
}
