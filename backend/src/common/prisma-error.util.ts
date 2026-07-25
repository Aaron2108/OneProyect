/**
 * Código de error de Prisma para violación de restricción única (`@unique`/`@@unique`).
 * Se compara por duck-typing (sin importar `Prisma.PrismaClientKnownRequestError`)
 * porque lo único que necesitamos es el código, no el tipo completo.
 */
export function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
