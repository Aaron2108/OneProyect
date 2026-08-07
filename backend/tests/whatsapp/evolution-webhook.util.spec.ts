import {
  esChatIgnorable,
  fechaDelMensaje,
  interpretarWebhookEvolution,
  telefonoDesdeJid,
  textoDelMensaje,
  tipoDelMensaje,
} from '../../src/whatsapp/providers/evolution-webhook.util';
import { EventoMensaje } from '../../src/whatsapp/providers/whatsapp-provider.interface';

/**
 * La traducción del webhook es el punto más frágil de la integración: es la
 * única parte que depende de la forma exacta de un payload ajeno, y un fallo
 * aquí no revienta nada —simplemente mete el mensaje en la conversación
 * equivocada, o lo pierde en silencio—.
 */
describe('interpretarWebhookEvolution', () => {
  const mensaje = (data: Record<string, unknown>) => ({
    event: 'messages.upsert',
    instance: 'wf-t1-abc',
    data,
  });

  describe('telefonoDesdeJid', () => {
    it('extrae el número de un JID normal', () => {
      expect(telefonoDesdeJid('51987654321@s.whatsapp.net')).toBe('51987654321');
    });

    it('descarta el sufijo de dispositivo', () => {
      expect(telefonoDesdeJid('51987654321:12@s.whatsapp.net')).toBe('51987654321');
    });

    it('devuelve null si no hay dígitos', () => {
      expect(telefonoDesdeJid(undefined)).toBeNull();
      expect(telefonoDesdeJid('@s.whatsapp.net')).toBeNull();
    });
  });

  describe('esChatIgnorable', () => {
    it('ignora grupos y estados', () => {
      expect(esChatIgnorable('12036304@g.us')).toBe(true);
      expect(esChatIgnorable('status@broadcast')).toBe(true);
    });

    it('acepta una conversación 1 a 1', () => {
      expect(esChatIgnorable('51987654321@s.whatsapp.net')).toBe(false);
    });
  });

  describe('textoDelMensaje', () => {
    it('lee el texto simple y el de un mensaje con formato', () => {
      expect(textoDelMensaje({ conversation: 'hola' })).toBe('hola');
      expect(textoDelMensaje({ extendedTextMessage: { text: 'con formato' } })).toBe('con formato');
    });

    it('aprovecha el pie de una imagen', () => {
      expect(textoDelMensaje({ imageMessage: { caption: '¿tienen este modelo?' } })).toBe(
        '¿tienen este modelo?',
      );
    });
  });

  describe('tipoDelMensaje', () => {
    it('normaliza al vocabulario de Meta, no al de Baileys', () => {
      expect(tipoDelMensaje({ message: { conversation: 'x' } })).toBe('text');
      expect(tipoDelMensaje({ message: { imageMessage: { caption: 'x' } } })).toBe('image');
      expect(tipoDelMensaje({ message: { documentMessage: { caption: 'x' } } })).toBe('document');
    });
  });

  describe('fechaDelMensaje', () => {
    it('convierte segundos epoch, vengan como número o como texto', () => {
      expect(fechaDelMensaje(1700000000).toISOString()).toBe('2023-11-14T22:13:20.000Z');
      expect(fechaDelMensaje('1700000000').toISOString()).toBe('2023-11-14T22:13:20.000Z');
    });

    it('cae a "ahora" con un timestamp ausente o absurdo', () => {
      expect(fechaDelMensaje(undefined).getTime()).toBeGreaterThan(0);
      expect(fechaDelMensaje(0).getTime()).toBeGreaterThan(0);
    });
  });

  describe('mensajes', () => {
    it('traduce un mensaje entrante completo', () => {
      const [evento] = interpretarWebhookEvolution(
        mensaje({
          key: { remoteJid: '51987654321@s.whatsapp.net', fromMe: false, id: '3EB0ABC' },
          pushName: 'Ana',
          messageTimestamp: 1700000000,
          message: { conversation: '¿abren el sábado?' },
        }),
      ) as [EventoMensaje];

      expect(evento).toEqual({
        clase: 'mensaje',
        externalId: 'wf-t1-abc',
        externalMessageId: '3EB0ABC',
        direccion: 'entrante',
        contactPhone: '51987654321',
        contactName: 'Ana',
        tipo: 'text',
        texto: '¿abren el sábado?',
        enviadoEn: new Date(1700000000 * 1000),
      });
    });

    it('marca como saliente lo que el negocio manda desde su propio teléfono', () => {
      const [evento] = interpretarWebhookEvolution(
        mensaje({
          key: { remoteJid: '51987654321@s.whatsapp.net', fromMe: true, id: '3EB0DEF' },
          pushName: 'Mi Negocio',
          message: { conversation: 'Sí, de 9 a 13' },
        }),
      ) as [EventoMensaje];

      expect(evento.direccion).toBe('saliente');
      // El teléfono sigue siendo el del CLIENTE aunque escriba el negocio.
      expect(evento.contactPhone).toBe('51987654321');
      // `pushName` trae aquí el nombre del negocio: usarlo renombraría al contacto.
      expect(evento.contactName).toBeNull();
    });

    it('descarta grupos, estados y mensajes sin texto', () => {
      expect(
        interpretarWebhookEvolution(
          mensaje({ key: { remoteJid: '12036304@g.us', id: 'x' }, message: { conversation: 'hola' } }),
        ),
      ).toEqual([]);
      expect(
        interpretarWebhookEvolution(
          mensaje({ key: { remoteJid: 'status@broadcast', id: 'x' }, message: { conversation: 'hola' } }),
        ),
      ).toEqual([]);
      expect(
        interpretarWebhookEvolution(
          mensaje({ key: { remoteJid: '51987654321@s.whatsapp.net', id: 'x' }, message: {} }),
        ),
      ).toEqual([]);
    });

    it('acepta `data` como lista además de como objeto', () => {
      const eventos = interpretarWebhookEvolution({
        event: 'messages.upsert',
        instance: 'wf-t1-abc',
        data: [
          {
            key: { remoteJid: '51987654321@s.whatsapp.net', id: 'a' },
            message: { conversation: 'uno' },
          },
          {
            key: { remoteJid: '51987654322@s.whatsapp.net', id: 'b' },
            message: { conversation: 'dos' },
          },
        ],
      });
      expect(eventos).toHaveLength(2);
    });
  });

  describe('estado de la sesión', () => {
    it('traduce "open" y "close"', () => {
      expect(
        interpretarWebhookEvolution({
          event: 'connection.update',
          instance: 'wf-t1-abc',
          data: { state: 'open', wuid: '51900000000@s.whatsapp.net' },
        }),
      ).toEqual([
        {
          clase: 'estado-sesion',
          externalId: 'wf-t1-abc',
          conectado: true,
          phoneNumber: '51900000000',
          motivo: null,
        },
      ]);

      const [cierre] = interpretarWebhookEvolution({
        event: 'connection.update',
        instance: 'wf-t1-abc',
        data: { state: 'close', statusReason: 401 },
      });
      expect(cierre).toMatchObject({ conectado: false, motivo: '401' });
    });

    it('ignora "connecting": es ruido de paso, no una caída', () => {
      expect(
        interpretarWebhookEvolution({
          event: 'connection.update',
          instance: 'wf-t1-abc',
          data: { state: 'connecting' },
        }),
      ).toEqual([]);
    });

    it('trata el cierre de sesión desde el teléfono como desconexión', () => {
      const [evento] = interpretarWebhookEvolution({
        event: 'logout.instance',
        instance: 'wf-t1-abc',
        data: {},
      });
      expect(evento).toMatchObject({ clase: 'estado-sesion', conectado: false });
    });
  });

  describe('vinculación', () => {
    it('recoge el QR renovado', () => {
      expect(
        interpretarWebhookEvolution({
          event: 'qrcode.updated',
          instance: 'wf-t1-abc',
          data: { qrcode: { base64: 'data:image/png;base64,AAA' } },
        }),
      ).toEqual([
        { clase: 'vinculacion', externalId: 'wf-t1-abc', codigoVinculacion: 'data:image/png;base64,AAA' },
      ]);
    });
  });

  describe('robustez', () => {
    it('no lanza ante payloads inesperados: devuelve lista vacía', () => {
      // Si esto lanzara, el webhook respondería 5xx y Evolution reintentaría el
      // mismo payload roto indefinidamente.
      expect(interpretarWebhookEvolution(null)).toEqual([]);
      expect(interpretarWebhookEvolution('texto suelto')).toEqual([]);
      expect(interpretarWebhookEvolution({})).toEqual([]);
      expect(interpretarWebhookEvolution({ event: 'presence.update', instance: 'i' })).toEqual([]);
      expect(interpretarWebhookEvolution(mensaje({}))).toEqual([]);
    });

    it('acepta el nombre del evento en cualquiera de sus dos formas', () => {
      const cuerpo = {
        instance: 'wf-t1-abc',
        data: { state: 'open' },
      };
      expect(interpretarWebhookEvolution({ ...cuerpo, event: 'connection.update' })).toHaveLength(1);
      expect(interpretarWebhookEvolution({ ...cuerpo, event: 'CONNECTION_UPDATE' })).toHaveLength(1);
    });
  });
});
