import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/Input';
import type { Contact } from '@/lib/types';

export function EditContactDialog({
  contact,
  onOpenChange,
  onSaved,
}: {
  contact: Contact | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (contact) {
      setName(contact.name || '');
      setNotes(contact.notes || '');
      setError('');
    }
  }, [contact]);

  async function save(): Promise<void> {
    if (!contact) return;
    setSaving(true);
    setError('');
    try {
      await api(`/contacts/${contact.id}`, {
        method: 'PATCH',
        body: { name: name.trim() || undefined, notes: notes.trim() || undefined },
      });
      onOpenChange(false);
      toast.show('Contacto actualizado');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!contact}
      onOpenChange={onOpenChange}
      title="Editar contacto"
      description="Actualiza el nombre o deja una nota interna para tu equipo."
      footer={
        <>
          <Button variant="sec" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="brand" onClick={save} loading={saving}>
            Guardar cambios
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
        <Label>Teléfono</Label>
        <Input className="font-mono" readOnly tabIndex={-1} value={contact?.phone || ''} style={{ background: 'var(--hover-bg)', color: 'var(--ink-soft)' }} />
      </Field>
      <Field>
        <Label htmlFor="cm_name">Nombre</Label>
        <Input id="cm_name" placeholder="Nombre del contacto" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field>
        <Label htmlFor="cm_notes">Notas</Label>
        <Textarea id="cm_notes" rows={3} placeholder="Ej. Cliente frecuente, prefiere las tardes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Dialog>
  );
}
