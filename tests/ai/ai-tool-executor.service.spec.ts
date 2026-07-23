import { AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationContext } from '../../src/ai/ai.types';
import { makeTestPiiCrypto } from '../helpers/pii-crypto.stub';

describe('AiToolExecutorService', () => {
  let executor: AiToolExecutorService;
  let prisma: {
    appointment: { create: jest.Mock };
    reminder: { create: jest.Mock };
    contact: { update: jest.Mock };
  };

  const ctx: ConversationContext = {
    tenantId: 'tenant-1',
    tenantName: 'Empresa',
    contactId: 'contact-1',
    contactName: 'Ana',
    contactPhone: '5215500000000',
    conversationId: 'conv-1',
  };

  beforeEach(() => {
    prisma = {
      appointment: { create: jest.fn().mockResolvedValue({ id: 'appt-1' }) },
      reminder: { create: jest.fn().mockResolvedValue({ id: 'rem-1' }) },
      contact: { update: jest.fn().mockResolvedValue({}) },
    };
    executor = new AiToolExecutorService(prisma as unknown as PrismaService, makeTestPiiCrypto());
  });

  it('crea una cita ligando tenant/contacto desde el contexto, no desde el input', async () => {
    const result = await executor.execute(
      'create_appointment',
      // el modelo NO envía tenantId/contactId; aunque los enviara, se ignoran
      { title: 'Consulta', scheduled_at: '2026-08-01T15:00:00Z', tenantId: 'HACK', contactId: 'HACK' },
      ctx,
    );
    expect(prisma.appointment.create).toHaveBeenCalledTimes(1);
    const arg = prisma.appointment.create.mock.calls[0][0].data;
    expect(arg.tenantId).toBe('tenant-1'); // del contexto, no 'HACK'
    expect(arg.contactId).toBe('contact-1');
    expect(arg.title).toBe('Consulta');
    expect(result).toContain('Cita creada');
  });

  it('rechaza una fecha de cita inválida sin tocar la BD', async () => {
    const result = await executor.execute(
      'create_appointment',
      { title: 'X', scheduled_at: 'no-es-fecha' },
      ctx,
    );
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(result).toContain('inválida');
  });

  it('crea un recordatorio con el tenant/contacto del contexto', async () => {
    await executor.execute(
      'create_reminder',
      { message: 'Seguimiento', remind_at: '2026-08-02T09:00:00Z' },
      ctx,
    );
    const arg = prisma.reminder.create.mock.calls[0][0].data;
    expect(arg.tenantId).toBe('tenant-1');
    expect(arg.contactId).toBe('contact-1');
    expect(arg.message).toBe('Seguimiento');
  });

  it('actualiza el contacto del contexto por id', async () => {
    await executor.execute('update_contact', { name: 'Ana Pérez' }, ctx);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { name: 'Ana Pérez' },
    });
  });

  it('cifra las notas del contacto antes de guardarlas', async () => {
    await executor.execute('update_contact', { notes: 'Alérgico al polen' }, ctx);
    const arg = prisma.contact.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'contact-1' });
    expect(arg.data.notes).not.toBe('Alérgico al polen');
    expect(arg.data.notes).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('devuelve mensaje para herramienta desconocida', async () => {
    const result = await executor.execute('borrar_todo', {}, ctx);
    expect(result).toContain('desconocida');
  });
});
