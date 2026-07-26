import { BadRequestException, Injectable } from '@nestjs/common';
import { isValidTimeZone } from '../ai/ai-datetime.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';

export interface BusinessProfileDto {
  businessHours: string | null;
  services: string | null;
  policies: string | null;
  tone: string | null;
  customInstructions: string | null;
  /** Zona IANA elegida por el negocio; null = se usa la del servidor. */
  timeZone: string | null;
  updatedAt: string | null;
}

/**
 * Contexto del negocio que el propietario le da a la IA (apartado "Agente IA"
 * del panel) — horarios, servicios, políticas, tono, instrucciones libres.
 * Sin esto, la IA solo conocía el nombre del tenant (ver docs/DECISIONS.md,
 * 2026-07-23). `describe()` lo usa `AiService` para inyectarlo en el system
 * prompt; el resto del servicio es el CRUD que usa el panel.
 */
@Injectable()
export class BusinessProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string): Promise<BusinessProfileDto> {
    const [profile, tenant] = await Promise.all([
      this.prisma.businessProfile.findUnique({ where: { tenantId } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timeZone: true } }),
    ]);
    return this.toDto(profile, tenant?.timeZone ?? null);
  }

  /** Nombre de la empresa — lo necesita el system prompt de la IA. */
  async tenantName(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant?.name ?? '';
  }

  /**
   * Zona horaria elegida por el negocio, o `null` si no eligió ninguna. Quien
   * llama decide el respaldo (`resolveTimeZone`): aquí no se inventa una zona,
   * porque devolver una por defecto haría indistinguible "eligió Lima" de "no
   * eligió nada".
   */
  async timeZoneOf(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timeZone: true },
    });
    return tenant?.timeZone ?? null;
  }

  /** Reemplaza el perfil completo del tenant (PUT: lo que no se envía queda vacío). Solo OWNER. */
  async upsert(tenantId: string, dto: UpdateBusinessProfileDto): Promise<BusinessProfileDto> {
    const timeZone = dto.timeZone?.trim() || null;
    // Se valida antes de guardar: una zona con un error de tipeo haría fallar a
    // `Intl` en cada mensaje, y el dueño no vería el error hasta que un cliente
    // escribiera. Mejor rechazarlo en el panel, donde puede corregirlo.
    if (timeZone && !isValidTimeZone(timeZone)) {
      throw new BadRequestException(
        `"${timeZone}" no es una zona horaria válida. Usa el formato IANA, por ejemplo "America/Lima".`,
      );
    }

    const data = {
      businessHours: dto.businessHours?.trim() || null,
      services: dto.services?.trim() || null,
      policies: dto.policies?.trim() || null,
      tone: dto.tone?.trim() || null,
      customInstructions: dto.customInstructions?.trim() || null,
    };
    const [profile] = await this.prisma.$transaction([
      this.prisma.businessProfile.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      }),
      this.prisma.tenant.update({ where: { id: tenantId }, data: { timeZone } }),
    ]);
    return this.toDto(profile, timeZone);
  }

  /**
   * Líneas de texto listas para el system prompt de la IA (solo los campos
   * que el negocio completó). `AiService.buildSystemPrompt` las añade tal
   * cual, igual que hace con los recuerdos de `AiContextMemoryService`.
   */
  async describe(tenantId: string): Promise<string[]> {
    const profile = await this.prisma.businessProfile.findUnique({ where: { tenantId } });
    if (!profile) return [];
    const lines: string[] = [];
    if (profile.businessHours) lines.push(`Horario de atención: ${profile.businessHours}`);
    if (profile.services) lines.push(`Servicios/productos que ofrece el negocio: ${profile.services}`);
    if (profile.policies) lines.push(`Políticas del negocio: ${profile.policies}`);
    if (profile.tone) lines.push(`Tono/estilo con el que debes responder: ${profile.tone}`);
    if (profile.customInstructions) lines.push(`Instrucciones adicionales del negocio: ${profile.customInstructions}`);
    return lines;
  }

  private toDto(
    profile: {
      businessHours: string | null;
      services: string | null;
      policies: string | null;
      tone: string | null;
      customInstructions: string | null;
      updatedAt: Date;
    } | null,
    timeZone: string | null,
  ): BusinessProfileDto {
    return {
      businessHours: profile?.businessHours ?? null,
      services: profile?.services ?? null,
      policies: profile?.policies ?? null,
      tone: profile?.tone ?? null,
      customInstructions: profile?.customInstructions ?? null,
      // Vive en `tenants`, no en el perfil: la usan las citas y los
      // recordatorios, no solo la IA. Viaja aquí porque es donde el dueño la
      // configura (ver DECISIONS.md).
      timeZone,
      updatedAt: profile?.updatedAt?.toISOString() ?? null,
    };
  }
}
