import { toCsv } from '../../src/common/csv.util';

describe('toCsv', () => {
  it('genera cabecera y filas separadas por CRLF', () => {
    const csv = toCsv(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('﻿A,B\r\n1,2\r\n3,4');
  });

  it('escapa comas, comillas y saltos de línea', () => {
    const csv = toCsv(['n'], [['a,b'], ['c"d'], ['e\nf']]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"c""d"'); // la comilla se duplica
    expect(csv).toContain('"e\nf"');
  });

  it('trata null/undefined como celda vacía', () => {
    expect(toCsv(['x'], [[null], [undefined]])).toBe('﻿x\r\n\r\n');
  });
});
