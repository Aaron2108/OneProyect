import { beforeEach, describe, expect, it } from 'vitest';
import { guardarConversacion, leerConversacionGuardada, type ChatTurn } from './test-chat.util';

const CLAVE = 'whatsflow:test-chat:v1';

const TURNOS: ChatTurn[] = [
  { role: 'user', text: '¿tienen turno el viernes?' },
  { role: 'assistant', text: 'Sí, a las 10:00', simulatedTools: [] },
];

describe('leerConversacionGuardada', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('sin nada guardado devuelve una lista vacía', () => {
    expect(leerConversacionGuardada()).toEqual([]);
  });

  it('recupera lo que se guardó', () => {
    guardarConversacion(TURNOS);
    expect(leerConversacionGuardada()).toEqual(TURNOS);
  });

  it('descarta lo que no es JSON en vez de reventar', () => {
    sessionStorage.setItem(CLAVE, 'esto no es json');
    expect(leerConversacionGuardada()).toEqual([]);
  });

  it('descarta un JSON que no es una lista', () => {
    sessionStorage.setItem(CLAVE, JSON.stringify({ role: 'user', text: 'hola' }));
    expect(leerConversacionGuardada()).toEqual([]);
  });

  it('filtra los turnos con forma incorrecta y conserva los buenos', () => {
    // El caso real: una versión anterior de la aplicación guardó otra forma.
    sessionStorage.setItem(
      CLAVE,
      JSON.stringify([{ role: 'user', text: 'válido' }, null, 42, { role: 'user' }, { text: 'suelto' }]),
    );
    expect(leerConversacionGuardada()).toEqual([
      { role: 'user', text: 'válido' },
      { text: 'suelto' },
    ]);
  });
});

describe('guardarConversacion', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('una conversación vacía borra la clave en vez de dejar "[]"', () => {
    guardarConversacion(TURNOS);
    guardarConversacion([]);
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  it('ida y vuelta', () => {
    guardarConversacion(TURNOS);
    expect(leerConversacionGuardada()).toEqual(TURNOS);
  });
});
