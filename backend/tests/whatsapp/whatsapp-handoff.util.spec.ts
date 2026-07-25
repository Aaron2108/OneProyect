import { requestsHumanAgent } from '../../src/whatsapp/whatsapp-handoff.util';

describe('requestsHumanAgent (auto-handoff RF-11)', () => {
  it.each([
    'Quiero hablar con una persona',
    'Necesito hablar con un humano por favor',
    'me pasas con un agente?',
    'quiero un asesor',
    'Puedo hablar con un representante',
    'quiero un agente real',
  ])('detecta la solicitud: "%s"', (text) => {
    expect(requestsHumanAgent(text)).toBe(true);
  });

  it.each([
    'Hola, quiero agendar una cita',
    '¿Cuál es el horario de atención?',
    'Gracias, muy amable',
    '',
  ])('no escala en mensajes normales: "%s"', (text) => {
    expect(requestsHumanAgent(text)).toBe(false);
  });
});
