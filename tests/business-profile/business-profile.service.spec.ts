import { BusinessProfileService } from '../../src/business-profile/business-profile.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('BusinessProfileService', () => {
  function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      businessProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        ...overrides,
      },
    } as unknown as PrismaService;
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
