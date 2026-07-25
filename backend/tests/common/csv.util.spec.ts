import { parseCsv, toCsv } from '../../src/common/csv.util';

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

describe('parseCsv', () => {
  it('lee una cabecera y sus filas', () => {
    expect(parseCsv('nombre,stock\nRemera,5\nPantalon,3')).toEqual([
      ['nombre', 'stock'],
      ['Remera', '5'],
      ['Pantalon', '3'],
    ]);
  });

  it('acepta punto y coma: es lo que exporta Excel en español', () => {
    // Sin detectar el separador, el archivo se leería como una sola columna y
    // la importación de cualquier tienda que use Excel fallaría entera.
    expect(parseCsv('nombre;precio;stock\nRemera;19,90;5')).toEqual([
      ['nombre', 'precio', 'stock'],
      ['Remera', '19,90', '5'],
    ]);
  });

  it('respeta el separador dentro de un campo entrecomillado', () => {
    expect(parseCsv('nombre,descripcion\n"Remera","Azul, talla M"')).toEqual([
      ['nombre', 'descripcion'],
      ['Remera', 'Azul, talla M'],
    ]);
  });

  it('interpreta las comillas escapadas', () => {
    expect(parseCsv('nombre\n"Remera ""slim fit"""')).toEqual([
      ['nombre'],
      ['Remera "slim fit"'],
    ]);
  });

  it('admite saltos de línea dentro de un campo entrecomillado', () => {
    const filas = parseCsv('nombre,descripcion\nRemera,"Linea 1\nLinea 2"');
    expect(filas).toHaveLength(2);
    expect(filas[1][1]).toBe('Linea 1\nLinea 2');
  });

  it('quita el BOM que antepone Excel', () => {
    // Con el BOM pegado, la cabecera no coincidiría con "nombre".
    expect(parseCsv('﻿nombre,stock\nRemera,5')[0][0]).toBe('nombre');
  });

  it('tolera CRLF y un salto de línea final', () => {
    expect(parseCsv('nombre,stock\r\nRemera,5\r\n')).toEqual([
      ['nombre', 'stock'],
      ['Remera', '5'],
    ]);
  });

  it('descarta filas completamente vacías', () => {
    expect(parseCsv('nombre\nRemera\n\n\nPantalon')).toEqual([
      ['nombre'],
      ['Remera'],
      ['Pantalon'],
    ]);
  });

  it('lo serializado se vuelve a leer igual (ida y vuelta)', () => {
    const csv = toCsv(
      ['nombre', 'descripcion'],
      [
        ['Remera', 'Azul, talla "M"'],
        ['Pantalon', 'Con\nsalto'],
      ],
    );
    expect(parseCsv(csv)).toEqual([
      ['nombre', 'descripcion'],
      ['Remera', 'Azul, talla "M"'],
      ['Pantalon', 'Con\nsalto'],
    ]);
  });
});
