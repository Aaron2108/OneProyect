import { chunkText } from '../../src/knowledge/knowledge-chunker.util';

describe('chunkText', () => {
  it('devuelve vacío para texto vacío o en blanco', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('deja un texto corto en un solo fragmento', () => {
    const text = 'Atendemos de lunes a viernes.';
    expect(chunkText(text, 100)).toEqual([text]);
  });

  it('parte un texto largo en varios fragmentos', () => {
    const text = 'Frase de relleno para llegar al límite. '.repeat(40);
    const chunks = chunkText(text, 200, 30);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('prefiere cortar en un salto de párrafo', () => {
    const first = 'A'.repeat(120);
    const second = 'B'.repeat(120);
    const chunks = chunkText(`${first}\n\n${second}`, 200, 20);
    // El primer fragmento termina donde acaba el párrafo, sin arrastrar B.
    expect(chunks[0]).toBe(first);
  });

  it('no corta a mitad de palabra cuando hay espacios disponibles', () => {
    const text = 'palabra '.repeat(60);
    for (const chunk of chunkText(text, 120, 20)) {
      expect(chunk).not.toMatch(/\bpalabr$|\bpalab$|\bpala$/);
    }
  });

  it('solapa fragmentos consecutivos para no perder el contexto del corte', () => {
    const text = Array.from({ length: 60 }, (_, i) => `oracion numero ${i}.`).join(' ');
    const chunks = chunkText(text, 200, 60);
    expect(chunks.length).toBeGreaterThan(1);
    // El final del primer fragmento reaparece al comienzo del segundo.
    const tail = chunks[0].slice(-25);
    expect(chunks[1].includes(tail.trim().split(' ').slice(-2).join(' '))).toBe(true);
  });

  it('termina aunque el solape sea mayor que el tamaño (no entra en bucle)', () => {
    const text = 'x'.repeat(1000);
    const chunks = chunkText(text, 100, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').length).toBeGreaterThanOrEqual(1000);
  });

  it('cubre todo el texto: la concatenación contiene el principio y el final', () => {
    const text = `INICIO ${'contenido variado. '.repeat(50)} FINAL`;
    const chunks = chunkText(text, 300, 40);
    expect(chunks[0]).toContain('INICIO');
    expect(chunks[chunks.length - 1]).toContain('FINAL');
  });
});
