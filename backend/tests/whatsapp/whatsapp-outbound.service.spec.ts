import { WhatsappConnectionStatus, WhatsappInstance, WhatsappProviderKind } from '@prisma/client';
import { WhatsAppProvider } from '../../src/whatsapp/providers/whatsapp-provider.interface';
import { WhatsappInstanceService } from '../../src/whatsapp/whatsapp-instance.service';
import { WhatsappOutboundService } from '../../src/whatsapp/whatsapp-outbound.service';

/**
 * La única salida de mensajes. Concentra las reglas de cuándo NO se puede
 * enviar, así que es donde hay que comprobar que la ventana de servicio de Meta
 * se aplica a Meta y solo a Meta: aplicarla con Evolution bloquearía envíos
 * perfectamente válidos, y no aplicarla con Meta provocaría rechazos de la API.
 */
describe('WhatsappOutboundService', () => {
  const AHORA = new Date('2026-08-07T12:00:00.000Z');
  const HACE_UNA_HORA = new Date(AHORA.getTime() - 60 * 60 * 1000);
  const HACE_DOS_DIAS = new Date(AHORA.getTime() - 48 * 60 * 60 * 1000);

  function instancia(over: Partial<WhatsappInstance> = {}): WhatsappInstance {
    return {
      id: 'i1',
      tenantId: 't1',
      provider: WhatsappProviderKind.EVOLUTION,
      externalId: 'wf-t1-abc',
      status: WhatsappConnectionStatus.CONNECTED,
      phoneNumber: '51900000000',
      credential: 'cifrado',
      qrCode: null,
      qrExpiresAt: null,
      lastError: null,
      connectedAt: AHORA,
      lastStatusAt: AHORA,
      createdAt: AHORA,
      updatedAt: AHORA,
      ...over,
    } as WhatsappInstance;
  }

  function setup(opts: { instancia?: WhatsappInstance | null; enviar?: jest.Mock } = {}) {
    const enviarTexto =
      opts.enviar ?? jest.fn().mockResolvedValue({ externalMessageId: 'ext.1' });
    const instancias = {
      buscarPorTenant: jest.fn().mockResolvedValue(
        opts.instancia === undefined ? instancia() : opts.instancia,
      ),
      credencialDe: () => 'en-claro',
    } as unknown as WhatsappInstanceService;
    const provider = { enviarTexto } as unknown as WhatsAppProvider;
    return { service: new WhatsappOutboundService(instancias, provider), enviarTexto };
  }

  const enviar = (service: WhatsappOutboundService, lastInboundAt: Date | null) =>
    service.enviarTexto({ tenantId: 't1', to: '51987654321', text: 'hola', lastInboundAt });

  it('envía cuando el canal está conectado', async () => {
    const { service, enviarTexto } = setup();
    const resultado = await enviar(service, HACE_UNA_HORA);

    expect(resultado).toEqual({ enviado: true, externalMessageId: 'ext.1', motivo: null });
    expect(enviarTexto).toHaveBeenCalledWith({
      externalId: 'wf-t1-abc',
      credential: 'en-claro',
      to: '51987654321',
      text: 'hola',
    });
  });

  it('no envía si el negocio nunca vinculó WhatsApp', async () => {
    const { service, enviarTexto } = setup({ instancia: null });
    expect(await enviar(service, HACE_UNA_HORA)).toMatchObject({
      enviado: false,
      motivo: 'canal-desconectado',
    });
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('no envía si la sesión se cayó', async () => {
    const { service, enviarTexto } = setup({
      instancia: instancia({ status: WhatsappConnectionStatus.QR_PENDING }),
    });
    expect(await enviar(service, HACE_UNA_HORA)).toMatchObject({ motivo: 'canal-desconectado' });
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('con Meta respeta la ventana de 24h (RF-10)', async () => {
    const { service, enviarTexto } = setup({
      instancia: instancia({ provider: WhatsappProviderKind.META }),
    });
    expect(await enviar(service, HACE_DOS_DIAS)).toMatchObject({
      enviado: false,
      motivo: 'ventana-cerrada',
    });
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('con Evolution NO aplica la ventana: es una regla de Meta, no de WhatsApp', async () => {
    const { service, enviarTexto } = setup();
    expect(await enviar(service, HACE_DOS_DIAS)).toMatchObject({ enviado: true });
    expect(enviarTexto).toHaveBeenCalled();
  });

  it('un fallo del proveedor se informa, no se propaga', async () => {
    const { service } = setup({
      enviar: jest.fn().mockRejectedValue(new Error('502 del servidor de WhatsApp')),
    });
    // Si esto lanzara, tumbaría la respuesta del panel al enviar un mensaje que
    // de todas formas ya quedó guardado en la conversación.
    expect(await enviar(service, HACE_UNA_HORA)).toEqual({
      enviado: false,
      externalMessageId: null,
      motivo: 'error-proveedor',
    });
  });
});
