import {
  SERVICE_WINDOW_MS,
  isWithinServiceWindow,
} from '../../src/whatsapp/whatsapp-window.util';

describe('isWithinServiceWindow (ventana de 24h — RF-10)', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');

  it('es true si el último entrante fue hace menos de 24h', () => {
    const lastInbound = new Date(now.getTime() - 60 * 60 * 1000); // hace 1h
    expect(isWithinServiceWindow(lastInbound, now)).toBe(true);
  });

  it('es false si el último entrante fue hace más de 24h', () => {
    const lastInbound = new Date(now.getTime() - SERVICE_WINDOW_MS - 1000);
    expect(isWithinServiceWindow(lastInbound, now)).toBe(false);
  });

  it('es false justo en el borde de 24h', () => {
    const lastInbound = new Date(now.getTime() - SERVICE_WINDOW_MS);
    expect(isWithinServiceWindow(lastInbound, now)).toBe(false);
  });

  it('es false si no hay último entrante', () => {
    expect(isWithinServiceWindow(null, now)).toBe(false);
    expect(isWithinServiceWindow(undefined, now)).toBe(false);
  });
});
