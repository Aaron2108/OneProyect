import { BusinessProfileService } from '../../src/business-profile/business-profile.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('BusinessProfileService', () => {
  /** `tenantTimeZone` simula la zona ya elegida por el negocio (columna `tenants`). */
  function makePrisma(
    overrides: Partial<Record<string, unknown>> = {},
    tenantTimeZone: string | null = null,
  ) {
    const tenantUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      businessProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        ...overrides,
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ timeZone: tenantTimeZone }),
        update: tenantUpdate,
      },
      // El upsert del perfil y la zona van en la misma transacción: no puede
      // quedar la zona guardada y el perfil no, ni al revés.
      $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    return prisma as unknown as PrismaService & { tenant: { update: jest.Mock } };
  }

  describe('get', () => {
    it('devuelve todos los campos en null si el tenant no tiene perfil aún', async () => {
      const service = new BusinessProfileService(makePrisma());
      const result = await service.get('t1');
      expect(result).toEqual({
        businessHours: null,
        services: null,
        policies: null,
        tone: null,
        customInstructions: null,
        timeZone: null,
        updatedAt: null,
      });
    });

    it('devuelve el perfil existente', async () => {
      const updatedAt = new Date('2026-07-23T00:00:00.000Z');
      const findUnique = jest.fn().mockResolvedValue({
        businessHours: 'L-V 9-18h',
        services: 'Cortes de cabello',
        policies: null,
        tone: 'Cercano',
        customInstructions: null,
        updatedAt,
      });
      const service = new BusinessProfileService(makePrisma({ findUnique }));
      const result = await service.get('t1');
      expect(result).toEqual({
        businessHours: 'L-V 9-18h',
        services: 'Cortes de cabello',
        policies: null,
        tone: 'Cercano',
        customInstructions: null,
        timeZone: null,
        updatedAt: updatedAt.toISOString(),
      });
    });
  });

  describe('upsert', () => {
    it('crea/actualiza los 5 campos, recortando espacios y vaciando lo omitido', async () => {
      const upsert = jest.fn().mockResolvedValue({
        businessHours: 'L-V 9-18h',
        services: null,
        policies: null,
        tone: null,
        customInstructions: null,
        updatedAt: new Date('2026-07-23T00:00:00.000Z'),
      });
      const service = new BusinessProfileService(makePrisma({ upsert }));

      await service.upsert('t1', { businessHours: '  L-V 9-18h  ' });

      expect(upsert).toHaveBeenCalledWith({
        where: { tenantId: 't1' },
        create: {
          tenantId: 't1',
          businessHours: 'L-V 9-18h',
          services: null,
          policies: null,
          tone: null,
          customInstructions: null,
        },
        update: {
          businessHours: 'L-V 9-18h',
          services: null,
          policies: null,
          tone: null,
          customInstructions: null,
        },
      });
    });
  });

  describe('zona horaria del negocio', () => {
    const okUpsert = () =>
      jest.fn().mockResolvedValue({
        businessHours: null,
        services: null,
        policies: null,
        tone: null,
        customInstructions: null,
        updatedAt: new Date('2026-07-23T00:00:00.000Z'),
      });

    it('la guarda en el tenant, no en el perfil', async () => {
      // La usan las citas y los recordatorios, no solo la IA: vive en `tenants`.
      const prisma = makePrisma({ upsert: okUpsert() });
      const service = new BusinessProfileService(prisma);

      const result = await service.upsert('t1', { timeZone: 'Europe/Madrid' });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { timeZone: 'Europe/Madrid' },
      });
      expect(result.timeZone).toBe('Europe/Madrid');
    });

    it('rechaza una zona que no existe en vez de guardarla', async () => {
      // Guardarla haría fallar a Intl en CADA mensaje, y el dueño no se
      // enteraría hasta que un cliente escribiera.
      const prisma = makePrisma({ upsert: okUpsert() });
      const service = new BusinessProfileService(prisma);

      await expect(service.upsert('t1', { timeZone: 'America/Limaa' })).rejects.toThrow(
        /no es una zona horaria válida/i,
      );
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('vaciarla es válido: se vuelve a la zona por defecto', async () => {
      const prisma = makePrisma({ upsert: okUpsert() });
      const service = new BusinessProfileService(prisma);

      await service.upsert('t1', { timeZone: '   ' });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { timeZone: null },
      });
    });

    it('timeZoneOf devuelve null si el negocio no eligió ninguna', async () => {
      // Devolver una por defecto haría indistinguible "eligió Lima" de "no
      // eligió nada", y quien llama no podría aplicar su propio respaldo.
      const service = new BusinessProfileService(makePrisma());
      expect(await service.timeZoneOf('t1')).toBeNull();
    });

    it('timeZoneOf devuelve la elegida', async () => {
      const service = new BusinessProfileService(makePrisma({}, 'Europe/Madrid'));
      expect(await service.timeZoneOf('t1')).toBe('Europe/Madrid');
    });

    it('get la expone junto al resto del perfil', async () => {
      const service = new BusinessProfileService(makePrisma({}, 'America/Bogota'));
      expect((await service.get('t1')).timeZone).toBe('America/Bogota');
    });
  });

  describe('describe (para el system prompt de la IA)', () => {
    it('devuelve [] si el tenant no configuró nada', async () => {
      const service = new BusinessProfileService(makePrisma());
      expect(await service.describe('t1')).toEqual([]);
    });

    it('solo incluye líneas de los campos que sí tienen contenido', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        businessHours: 'L-V 9-18h',
        services: null,
        policies: null,
        tone: 'Cercano y profesional',
        customInstructions: null,
        updatedAt: new Date(),
      });
      const service = new BusinessProfileService(makePrisma({ findUnique }));

      const lines = await service.describe('t1');

      expect(lines).toEqual([
        'Horario de atención: L-V 9-18h',
        'Tono/estilo con el que debes responder: Cercano y profesional',
      ]);
    });
  });
});
