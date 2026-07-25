import { ConfigService } from '@nestjs/config';
import { AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
import { AppointmentsService } from '../../src/appointments/appointments.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationContext } from '../../src/ai/ai.types';
import { makeTestPiiCrypto } from '../helpers/pii-crypto.stub';

describe('AiToolExecutorService', () => {
  let executor: AiToolExecutorService;
  let prisma: {
    reminder: { create: jest.Mock };
    contact: { update: jest.Mock };
  };
  let appointments: { create: jest.Mock };

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
      reminder: { create: jest.fn().mockResolvedValue({ id: 'rem-1' }) },
      contact: { update: jest.fn().mockResolvedValue({}) },
    };
    appointments = { create: jest.fn().mockResolvedValue({ id: 'appt-1' }) };
    executor = new AiToolExecutorService(
      prisma as unknown as PrismaService,
      makeTestPiiCrypto(),
      appointments as unknown as AppointmentsService,
      // Zona fija: si dependiera de la del servidor, el test pasaría o fallaría
      // según la máquina que lo corra.
      { get: () => 'America/Lima' } as unknown as ConfigService,
    );
  });

  it('crea una cita vía AppointmentsService (para sincronizar con Google Calendar) ligando tenant/contacto desde el contexto, no desde el input', async () => {
    const result = await executor.execute(
      'create_appointment',
      // el modelo NO envía tenantId/contactId; aunque los enviara, se ignoran
      { title: 'Consulta', scheduled_at: '2026-08-01T15:00:00Z', tenantId: 'HACK', contactId: 'HACK' },
      ctx,
    );
    expect(appointments.create).toHaveBeenCalledTimes(1);
    const [tenantId, dto] = appointments.create.mock.calls[0];
    expect(tenantId).toBe('tenant-1'); // del contexto, no 'HACK'
    expect(dto.contactId).toBe('contact-1');
    expect(dto.title).toBe('Consulta');
    expect(result).toContain('Cita creada');
  });

  it('el resultado no filtra el id interno: el modelo lo repite tal cual al cliente', async () => {
    const result = await executor.execute(
      'create_appointment',
      { title: 'Corte', scheduled_at: '2026-08-03T16:00:00-05:00' },
      ctx,
    );
    expect(result).not.toContain('appt-1');
    expect(result).not.toMatch(/\bid\b/i);
  });

  it('confirma la hora en la zona del negocio, no en UTC', async () => {
    // Si se confirmara en UTC, el cliente que pidió las 16:00 leería "21:00".
    const result = await executor.execute(
      'create_appointment',
      { title: 'Corte', scheduled_at: '2026-08-03T16:00:00-05:00' },
      ctx,
    );
    expect(result).toContain('16:00');
    expect(result).toContain('agosto');
  });

  it('un recordatorio tampoco filtra su id', async () => {
    const result = await executor.execute(
      'create_reminder',
      { message: 'Recordar la cita', remind_at: '2026-08-02T09:00:00-05:00' },
      ctx,
    );
    expect(result).not.toContain('rem-1');
    expect(result).toContain('09:00');
  });

  describe('describeWithoutExecuting (chat de prueba del panel)', () => {
    const cita = { title: 'Corte', scheduled_at: '2026-08-03T16:00:00-05:00' };

    it('no toca la base de datos', () => {
      executor.describeWithoutExecuting('create_appointment', cita);
      executor.describeWithoutExecuting('create_reminder', {
        message: 'x',
        remind_at: '2026-08-03T16:00:00-05:00',
      });
      executor.describeWithoutExecuting('update_contact', { name: 'Ana' });

      expect(appointments.create).not.toHaveBeenCalled();
      expect(prisma.reminder.create).not.toHaveBeenCalled();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('devuelve exactamente el mismo texto que la ejecución real', async () => {
      // Si divergieran, el dueño probaría una cosa y su cliente leería otra.
      const real = await executor.execute('create_appointment', cita, ctx);
      expect(executor.describeWithoutExecuting('create_appointment', cita)).toBe(real);
    });

    it('informa la fecha inválida igual que la ejecución real', () => {
      expect(executor.describeWithoutExecuting('create_appointment', { title: 'X' })).toContain(
        'inválida',
      );
    });
  });

  it('rechaza una fecha de cita inválida sin tocar la BD', async () => {
    const result = await executor.execute(
      'create_appointment',
      { title: 'X', scheduled_at: 'no-es-fecha' },
      ctx,
    );
    expect(appointments.create).not.toHaveBeenCalled();
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
