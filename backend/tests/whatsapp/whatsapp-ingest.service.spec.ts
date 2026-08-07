import { Queue } from 'bullmq';
import { WhatsappConnectionStatus, WhatsappInstance, WhatsappProviderKind } from '@prisma/client';
import { EventoWhatsApp } from '../../src/whatsapp/providers/whatsapp-provider.interface';
import { WhatsappIngestService } from '../../src/whatsapp/whatsapp-ingest.service';
import { WhatsappInstanceService } from '../../src/whatsapp/whatsapp-instance.service';

describe('WhatsappIngestService', () => {
  const INSTANCIA = {
    id: 'i1',
    tenantId: 't1',
    provider: WhatsappProviderKind.EVOLUTION,
    externalId: 'wf-t1-abc',
    status: WhatsappConnectionStatus.CONNECTED,
  } as WhatsappInstance;

  function setup(instancia: WhatsappInstance | null = INSTANCIA) {
    const add = jest.fn().mockResolvedValue(undefined);
    const aplicarEstado = jest.fn().mockResolvedValue(undefined);
    const aplicarVinculacion = jest.fn().mockResolvedValue(undefined);
    const instancias = {
      buscarPorExternalId: jest.fn().mockResolvedValue(instancia),
      aplicarEstado,
      aplicarVinculacion,
    } as unknown as WhatsappInstanceService;
    return {
      service: new WhatsappIngestService(instancias, { add } as unknown as Queue),
      add,
      aplicarEstado,
      aplicarVinculacion,
    };
  }

  const mensaje: EventoWhatsApp = {
    clase: 'mensaje',
    externalId: 'wf-t1-abc',
    externalMessageId: '3EB0ABC',
    direccion: 'entrante',
    contactPhone: '51987654321',
    contactName: 'Ana',
    tipo: 'text',
    texto: 'hola',
    enviadoEn: new Date('2026-08-07T10:00:00.000Z'),
  };

  it('encola el mensaje con el tenant resuelto desde la instancia', async () => {
    const { service, add } = setup();
    expect(await service.ingerir([mensaje])).toBe(1);

    const [, job, opts] = add.mock.calls[0];
    expect(job).toEqual({
      tenantId: 't1',
      externalId: 'wf-t1-abc',
      externalMessageId: '3EB0ABC',
      direccion: 'entrante',
      contactPhone: '51987654321',
      contactName: 'Ana',
      tipo: 'text',
      texto: 'hola',
      // ISO, no Date: BullMQ serializa el job a JSON.
      enviadoEn: '2026-08-07T10:00:00.000Z',
    });
    // Dedup de reenvíos del proveedor. Sin ":" — BullMQ no lo admite.
    expect(opts.jobId).toBe('wf-t1-abc_3EB0ABC');
    expect(opts.jobId).not.toContain(':');
  });

  it('descarta eventos de una sesión que no es de nadie', async () => {
    // Sin esto, quien alcance la ruta del webhook podría escribir en la bandeja
    // de cualquier negocio inventándose el identificador de instancia.
    const { service, add } = setup(null);
    expect(await service.ingerir([mensaje])).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it('aplica los cambios de estado de la sesión', async () => {
    const { service, aplicarEstado, add } = setup();
    await service.ingerir([
      {
        clase: 'estado-sesion',
        externalId: 'wf-t1-abc',
        conectado: true,
        phoneNumber: '51900000000',
        motivo: null,
      },
    ]);
    expect(aplicarEstado).toHaveBeenCalledWith(INSTANCIA, true, '51900000000', null);
    expect(add).not.toHaveBeenCalled();
  });

  it('guarda el código de vinculación renovado', async () => {
    const { service, aplicarVinculacion } = setup();
    await service.ingerir([
      { clase: 'vinculacion', externalId: 'wf-t1-abc', codigoVinculacion: 'data:image/png;base64,AAA' },
    ]);
    expect(aplicarVinculacion).toHaveBeenCalledWith(INSTANCIA, 'data:image/png;base64,AAA');
  });
});
