import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import {
  TOOL_CREATE_APPOINTMENT,
  TOOL_CREATE_REMINDER,
  TOOL_UPDATE_CONTACT,
} from './ai.constants';
import { ConversationContext } from './ai.types';

/**
 * Definiciones de las herramientas expuestas al modelo. Importante: NINGUNA
 * expone `tenantId`/`contactId` — esos vienen del contexto de confianza y los
 * inyecta el ejecutor. Así, texto no confiable del cliente no puede redirigir
 * una acción a otro contacto o tenant (ver `injection-analyst` en TASKS.md).
 */
export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: TOOL_CREATE_APPOINTMENT,
    description:
      'Programa una cita para el contacto actual de la conversación. Úsala cuando el cliente pida agendar o confirmar una cita con fecha y hora concretas.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Motivo o título de la cita' },
        scheduled_at: {
          type: 'string',
          description: 'Fecha y hora de la cita en formato ISO 8601 (ej. 2026-08-01T15:00:00Z)',
        },
        notes: { type: 'string', description: 'Notas opcionales' },
      },
      required: ['title', 'scheduled_at'],
    },
  },
  {
    name: TOOL_CREATE_REMINDER,
    description:
      'Crea un recordatorio para el contacto actual. Úsala para seguimientos o para recordar algo en una fecha futura.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Texto del recordatorio' },
        remind_at: {
          type: 'string',
          description: 'Fecha y hora del recordatorio en formato ISO 8601',
        },
      },
      required: ['message', 'remind_at'],
    },
  },
  {
    name: TOOL_UPDATE_CONTACT,
    description:
      'Actualiza los datos del contacto actual (nombre o notas). Úsala cuando el cliente proporcione o corrija su información.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del contacto' },
        notes: { type: 'string', description: 'Notas sobre el contacto' },
      },
    },
  },
];

@Injectable()
export class AiToolExecutorService {
  private readonly logger = new Logger(AiToolExecutorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ejecuta una herramienta invocada por el modelo, ligando tenant/contacto
   * desde el contexto de confianza (no desde la entrada del modelo).
   * Devuelve un texto de resultado que se le devuelve a la IA como tool_result.
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    try {
      switch (toolName) {
        case TOOL_CREATE_APPOINTMENT:
          return await this.createAppointment(input, ctx);
        case TOOL_CREATE_REMINDER:
          return await this.createReminder(input, ctx);
        case TOOL_UPDATE_CONTACT:
          return await this.updateContact(input, ctx);
        default:
          return `Herramienta desconocida: ${toolName}`;
      }
    } catch (err) {
      this.logger.error(`Error ejecutando ${toolName}: ${(err as Error).message}`);
      return `No se pudo completar la acción: ${(err as Error).message}`;
    }
  }

  private async createAppointment(
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    const scheduledAt = this.parseDate(input.scheduled_at);
    if (!scheduledAt) return 'Fecha de la cita inválida.';
    const appt = await this.prisma.appointment.create({
      data: {
        tenantId: ctx.tenantId,
        contactId: ctx.contactId,
        title: String(input.title ?? 'Cita'),
        scheduledAt,
        notes: input.notes ? String(input.notes) : null,
      },
    });
    return `Cita creada (id ${appt.id}) para ${scheduledAt.toISOString()}.`;
  }

  private async createReminder(
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    const remindAt = this.parseDate(input.remind_at);
    if (!remindAt) return 'Fecha del recordatorio inválida.';
    const reminder = await this.prisma.reminder.create({
      data: {
        tenantId: ctx.tenantId,
        contactId: ctx.contactId,
        message: String(input.message ?? ''),
        remindAt,
      },
    });
    return `Recordatorio creado (id ${reminder.id}) para ${remindAt.toISOString()}.`;
  }

  private async updateContact(
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    const data: { name?: string; notes?: string } = {};
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.notes === 'string') data.notes = input.notes;
    if (Object.keys(data).length === 0) return 'No se indicó ningún campo a actualizar.';
    await this.prisma.contact.update({ where: { id: ctx.contactId }, data });
    return 'Contacto actualizado.';
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
