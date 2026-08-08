import { ConfigService } from '@nestjs/config';
import { AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
import { AppointmentsService } from '../../src/appointments/appointments.service';
import { ProductsService } from '../../src/products/products.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationContext } from '../../src/ai/ai.types';
import { makeTestPiiCrypto } from '../helpers/pii-crypto.stub';

describe('AiToolExecutorService', () => {
  let executor: AiToolExecutorService;
  let prisma: {
    reminder: { create: jest.Mock };
    contact: { update: jest.Mock };
    conversation: { updateMany: jest.Mock };
    conversationNote: { create: jest.Mock };
  };
  let appointments: { create: jest.Mock };
  let products: { searchForAi: jest.Mock; countActive: jest.Mock };

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
      conversation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      conversationNote: { create: jest.fn().mockResolvedValue({ id: 'nota-1' }) },
    };
    appointments = { create: jest.fn().mockResolvedValue({ id: 'appt-1' }) };
    products = {
      searchForAi: jest.fn().mockResolvedValue([]),
      countActive: jest.fn().mockResolvedValue(0),
    };
    executor = new AiToolExecutorService(
      prisma as unknown as PrismaService,
      makeTestPiiCrypto(),
      appointments as unknown as AppointmentsService,
      products as unknown as ProductsService,
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

  it('confirma la hora en la zona que trae el contexto, no en la global', async () => {
    // Dos negocios en husos distintos: el mismo instante se le confirma a cada
    // cliente en SU hora local. Con una zona global, uno de los dos leía mal.
    const enMadrid = await executor.execute(
      'create_appointment',
      { title: 'Corte', scheduled_at: '2026-08-03T16:00:00-05:00' },
      { ...ctx, timeZone: 'Europe/Madrid' },
    );
    expect(enMadrid).toContain('23:00'); // 16:00 en Lima = 23:00 en Madrid

    const enLima = await executor.execute(
      'create_appointment',
      { title: 'Corte', scheduled_at: '2026-08-03T16:00:00-05:00' },
      { ...ctx, timeZone: 'America/Lima' },
    );
    expect(enLima).toContain('16:00');
  });

  it('sin zona en el contexto usa la global de respaldo', async () => {
    const result = await executor.execute(
      'create_appointment',
      { title: 'Corte', scheduled_at: '2026-08-03T16:00:00-05:00' },
      ctx, // sin timeZone
    );
    expect(result).toContain('16:00'); // America/Lima, la del ConfigService
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

  describe('consultar_producto', () => {
    it('consulta el catálogo del tenant del contexto, no del que diga el modelo', async () => {
      products.searchForAi.mockResolvedValue([
        { name: 'Remera azul', sku: 'A-1', priceCents: 1990, currency: 'PEN', stock: 4 },
      ]);

      const result = await executor.execute(
        'consultar_producto',
        { consulta: 'remera', tenantId: 'HACK' },
        ctx,
      );

      expect(products.searchForAi).toHaveBeenCalledWith('tenant-1', 'remera', expect.any(Number));
      expect(result).toContain('Remera azul');
      expect(result).toContain('19.90 PEN');
      expect(result).toContain('4 disponibles');
    });

    it('no le pasa el SKU al modelo: es un codigo interno del negocio', async () => {
      // En una prueba real el agente le solto al cliente "es el modelo 500ml
      // (DEMO-01)". Mismo criterio que con el id de una cita: si no lo tiene,
      // no puede repetirlo.
      products.searchForAi.mockResolvedValue([
        { name: 'Remera azul', sku: 'DEMO-01', priceCents: 1990, currency: 'PEN', stock: 4 },
      ]);
      const result = await executor.execute('consultar_producto', { consulta: 'remera' }, ctx);
      expect(result).not.toContain('DEMO-01');
    });

    it('le prohibe ofrecer reservas: la consulta es de solo lectura', async () => {
      // Ofrecia "reservarlo" y no existe ninguna funcion de reserva.
      products.searchForAi.mockResolvedValue([
        { name: 'Remera', sku: null, priceCents: 1990, currency: 'PEN', stock: 4 },
      ]);
      const result = await executor.execute('consultar_producto', { consulta: 'remera' }, ctx);
      expect(result).toMatch(/no ofrezcas reservar/i);
    });

    it('marca claramente lo que no tiene existencias', async () => {
      products.searchForAi.mockResolvedValue([
        { name: 'Gorra', sku: null, priceCents: 2500, currency: null, stock: 0 },
      ]);
      const result = await executor.execute('consultar_producto', { consulta: 'gorra' }, ctx);
      expect(result).toContain('SIN STOCK');
    });

    it('sin moneda configurada le prohíbe al modelo inventarse una', async () => {
      // Caso real: el negocio no declaró moneda y el agente dijo "COP".
      products.searchForAi.mockResolvedValue([
        { name: 'Remera', sku: null, priceCents: 1990, currency: null, stock: 2 },
      ]);
      const result = await executor.execute('consultar_producto', { consulta: 'remera' }, ctx);
      expect(result).toContain('19.90');
      expect(result).toMatch(/no configuró la moneda/i);
    });

    it('sin precio no inventa uno', async () => {
      products.searchForAi.mockResolvedValue([
        { name: 'Servicio', sku: null, priceCents: null, currency: null, stock: 1 },
      ]);
      const result = await executor.execute('consultar_producto', { consulta: 'servicio' }, ctx);
      expect(result).toContain('precio no indicado');
    });

    it('si no encuentra nada, pide confirmar con el equipo en vez de negarlo', async () => {
      // "No lo encontré" y "no lo vendemos" no son lo mismo: el producto puede
      // estar guardado con otro nombre.
      products.searchForAi.mockResolvedValue([]);
      const result = await executor.execute('consultar_producto', { consulta: 'zapatos' }, ctx);
      expect(result).toContain('zapatos');
      expect(result).toMatch(/confirmar|equipo/i);
    });

    it('no escribe nada en la base de datos: es solo de lectura', async () => {
      products.searchForAi.mockResolvedValue([]);
      await executor.execute('consultar_producto', { consulta: 'algo' }, ctx);
      expect(appointments.create).not.toHaveBeenCalled();
      expect(prisma.reminder.create).not.toHaveBeenCalled();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('sin consulta enseña el catálogo en vez de pedir que precise', async () => {
      // "¿que otro productos tienes?" es una pregunta legitima: antes se
      // respondia "falta indicar que producto buscar", o peor, con el unico
      // articulo cuya descripcion mencionaba la palabra "producto".
      products.searchForAi.mockResolvedValue([
        { name: 'Shampoo', sku: null, priceCents: 1890, currency: 'PEN', stock: 12 },
      ]);
      products.countActive.mockResolvedValue(1);

      const result = await executor.execute('consultar_producto', { consulta: '  ' }, ctx);

      expect(products.searchForAi).toHaveBeenCalled();
      expect(result).toContain('Catálogo completo');
      expect(result).toContain('Shampoo');
    });

    it('si hay más productos que los mostrados, lo dice', async () => {
      // Sin esto, el agente daba a entender que el catalogo entero eran los
      // pocos que le llegaron.
      products.searchForAi.mockResolvedValue([
        { name: 'Shampoo', sku: null, priceCents: 1890, currency: 'PEN', stock: 12 },
      ]);
      products.countActive.mockResolvedValue(9);

      const result = await executor.execute('consultar_producto', {}, ctx);

      expect(result).toContain('9 productos');
      expect(result).toMatch(/ofrece buscar algo concreto/i);
    });

    it('con el catálogo vacío no afirma que no se vende nada', async () => {
      products.searchForAi.mockResolvedValue([]);
      const result = await executor.execute('consultar_producto', {}, ctx);
      expect(result).toMatch(/NO significa que el negocio no venda nada/i);
    });

    // Visto con una barbería real: tenía sus cortes y precios escritos en el
    // perfil y ningún producto dado de alta, y el agente derivaba al equipo la
    // pregunta por precios. Un catálogo vacío no es un negocio sin nada que
    // ofrecer; antes de derivar hay que mirar la información del negocio.
    it('con el catálogo vacío manda mirar la información del negocio antes de derivar', async () => {
      products.searchForAi.mockResolvedValue([]);

      const general = await executor.execute('consultar_producto', {}, ctx);
      expect(general).toMatch(/si su información incluye servicios o precios, respóndelos desde ahí/i);
      expect(general).toMatch(/solo si tampoco están/i);

      const concreta = await executor.execute('consultar_producto', { consulta: 'tinte' }, ctx);
      expect(concreta).toMatch(/antes de derivar/i);
      expect(concreta).toContain('tinte');
    });
  });

  describe('escalar_a_humano', () => {
    it('pasa la conversación a un humano acotando por tenant', async () => {
      await executor.execute('escalar_a_humano', { motivo: 'no sé la política de devoluciones' }, ctx);

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        // El tenant va en el filtro además del id: aunque `ctx` sea de confianza,
        // ningún fallo futuro puede tocar la conversación de otro negocio.
        where: { id: 'conv-1', tenantId: 'tenant-1' },
        data: { handledBy: 'HUMAN' },
      });
    });

    it('deja el motivo como nota interna cifrada para quien la retome', async () => {
      await executor.execute('escalar_a_humano', { motivo: 'pregunta por reembolsos' }, ctx);

      const data = prisma.conversationNote.create.mock.calls[0][0].data;
      expect(data.tenantId).toBe('tenant-1');
      expect(data.conversationId).toBe('conv-1');
      expect(data.body).not.toContain('reembolsos'); // se guarda cifrada
      expect(data.body).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('la nota no se le atribuye a ninguna persona del equipo', async () => {
      // Firmarla con un usuario real haría creer que alguien la escribió.
      await executor.execute('escalar_a_humano', { motivo: 'x' }, ctx);
      const data = prisma.conversationNote.create.mock.calls[0][0].data;
      expect(data.authorName).toBe('Agente IA');
      expect(data.authorId).not.toBe('contact-1');
    });

    it('le prohíbe al modelo seguir intentando responder', async () => {
      // Sin esto vuelve a contestar la pregunta que acaba de admitir que no sabe.
      const result = await executor.execute('escalar_a_humano', { motivo: 'x' }, ctx);
      expect(result).toMatch(/NO intentes responder/i);
      expect(result).toMatch(/persona del equipo/i);
    });

    it('sin motivo no escala ni deja nota', async () => {
      const result = await executor.execute('escalar_a_humano', { motivo: '  ' }, ctx);
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(prisma.conversationNote.create).not.toHaveBeenCalled();
      expect(result).toContain('Falta indicar');
    });

    it('si la conversación no es de este tenant, no deja la nota huérfana', async () => {
      prisma.conversation.updateMany.mockResolvedValue({ count: 0 });
      const result = await executor.execute('escalar_a_humano', { motivo: 'x' }, ctx);
      expect(prisma.conversationNote.create).not.toHaveBeenCalled();
      expect(result).toContain('No se pudo escalar');
    });

    it('en el chat de prueba se simula: no escala una conversación real', async () => {
      const texto = executor.describeWithoutExecuting('escalar_a_humano', { motivo: 'x' });
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(prisma.conversationNote.create).not.toHaveBeenCalled();
      // Mismo texto que la ejecución real: el dueño prueba lo que verá su cliente.
      expect(texto).toBe(await executor.execute('escalar_a_humano', { motivo: 'x' }, ctx));
    });
  });

  it('devuelve mensaje para herramienta desconocida', async () => {
    const result = await executor.execute('borrar_todo', {}, ctx);
    expect(result).toContain('desconocida');
  });
});
