import { assertTenantId } from '../../src/common/tenant.util';

/**
 * Defensa en profundidad de la fuga entre tenants (ver docs/DECISIONS.md
 * 2026-08-08). El fallo real fue una consulta con `tenantId: undefined` que
 * Prisma convertía en "sin filtro". Este helper hace que un tenant sin resolver
 * falle en el acto, en la frontera del servicio, en vez de filtrar en silencio.
 */
describe('assertTenantId', () => {
  it('acepta un tenantId no vacío', () => {
    expect(() => assertTenantId('t-123')).not.toThrow();
  });

  it('rechaza undefined (el caso exacto del run-1)', () => {
    expect(() => assertTenantId(undefined)).toThrow(/sin resolver/i);
  });

  it('rechaza null', () => {
    expect(() => assertTenantId(null)).toThrow();
  });

  it('rechaza la cadena vacía', () => {
    // Una cadena vacía en un `where` de Prisma no cae como undefined, pero
    // tampoco identifica a ningún negocio: no debe pasar.
    expect(() => assertTenantId('')).toThrow();
  });

  it('rechaza tipos que no son texto', () => {
    expect(() => assertTenantId(123)).toThrow();
    expect(() => assertTenantId({})).toThrow();
  });

  it('estrecha el tipo a string tras la aserción', () => {
    const v: unknown = 't-1';
    assertTenantId(v);
    // Si compila, la aserción estrechó `unknown` a `string`.
    const s: string = v;
    expect(s).toBe('t-1');
  });
});
