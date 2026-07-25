import { isUniqueConstraintViolation } from '../../src/common/prisma-error.util';

describe('isUniqueConstraintViolation', () => {
  it('es true para un error con code P2002', () => {
    expect(isUniqueConstraintViolation({ code: 'P2002' })).toBe(true);
  });

  it('es false para otros códigos de error de Prisma', () => {
    expect(isUniqueConstraintViolation({ code: 'P2025' })).toBe(false);
  });

  it('es false para un Error normal sin code', () => {
    expect(isUniqueConstraintViolation(new Error('algo falló'))).toBe(false);
  });

  it('es false para valores no-objeto', () => {
    expect(isUniqueConstraintViolation('P2002')).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
  });
});
