import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationHandler } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { AppointmentsService } from '../appointments/appointments.service';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatBusinessDateTime, resolveTimeZone } from './ai-datetime.util';
import { ProductsService } from '../products/products.service';
import {
  AI_AUTHOR_ID,
  AI_AUTHOR_NAME,
  PRODUCT_SEARCH_LIMIT,
  TOOL_CHECK_PRODUCT,
  TOOL_CREATE_APPOINTMENT,
  TOOL_CREATE_REMINDER,
  TOOL_ESCALATE_TO_HUMAN,
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
    // Se probó a añadir aquí "hasta que esto responda el cliente NO tiene cita".
    // Contraproducente y medido: con esa frase el modelo pasó de agendar 4 de
    // cada 5 veces a 0 de 8 — leyó la advertencia como un motivo para no llamar
    // a la herramienta. La descripción se queda diciendo CUÁNDO usarla, y la
    // prohibición de confirmar sin ejecutar vive en el system prompt.
    description:
      'Programa una cita para el contacto actual de la conversación. Úsala cuando el cliente pida agendar o confirmar una cita con fecha y hora concretas.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Motivo o título de la cita' },
        scheduled_at: {
          type: 'string',
          description:
            'Fecha y hora de la cita en ISO 8601 con el desplazamiento de la zona del negocio, indicado en el contexto (ej. 2026-08-01T15:00:00-05:00). No la escribas en UTC.',
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
          description:
            'Fecha y hora del recordatorio en ISO 8601 con el desplazamiento de la zona del negocio (ej. 2026-08-01T09:00:00-05:00). No la escribas en UTC.',
        },
      },
      required: ['message', 'remind_at'],
    },
  },
  {
    name: TOOL_CHECK_PRODUCT,
    // "Nunca respondas de memoria" se acotó a los productos REGISTRADOS. Antes
    // era absoluto, y con el catálogo vacío el agente derivaba al equipo una
    // pregunta por precios que el negocio tenía escrita en su información —el
    // caso más común, porque muchos negocios de servicios (una barbería, un
    // taller) ponen su lista ahí y no dan de alta productos.
    description:
      'Consulta el catálogo de PRODUCTOS REGISTRADOS del negocio: si uno existe, a qué precio y cuánto stock queda. Úsala cuando el cliente pregunte por disponibilidad o existencias de un artículo concreto — el stock cambia y no debes responderlo de memoria. Si pregunta en general qué se vende, llámala con `consulta` vacía. Ojo: los servicios y precios que el negocio haya escrito en su información NO están aquí, y para esos no hace falta esta herramienta: respóndelos directamente.',
    input_schema: {
      type: 'object',
      properties: {
        consulta: {
          type: 'string',
          description:
            'Lo que busca el cliente: nombre del producto o código. Ej. "remera azul", "SKU-123". Déjala vacía si pregunta en general qué productos hay.',
        },
      },
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
  {
    name: TOOL_ESCALATE_TO_HUMAN,
    description:
      'Pasa la conversación a una persona del equipo y deja de responder automáticamente. Úsala cuando NO puedas responder con seguridad: te falta el dato, la pregunta no está cubierta por la información del negocio, el cliente reclama o está molesto, o te piden algo que no puedes hacer. Es preferible que una persona conteste a que tú improvises un dato equivocado. No la uses para preguntas que sí puedes responder con la información que tienes.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description:
            'Por qué no puedes resolverlo, en una frase. Lo lee el equipo, no el cliente. Ej. "pregunta por la política de devoluciones, que no está en la información del negocio".',
        },
      },
      required: ['motivo'],
    },
  },
];

/**
 * Lo que se le devuelve al modelo tras escalar. Le dice qué hacer a continuación
 * porque el turno no termina aquí: todavía escribe el último mensaje que lee el
 * cliente, y sin esta instrucción vuelve a intentar responder la pregunta que
 * acaba de reconocer que no sabe.
 */
const ESCALATION_RESULT =
  'Conversación pasada a una persona del equipo. Despídete confirmándole al cliente que alguien del equipo le responderá, sin prometer un plazo concreto. NO intentes responder la consulta tú.';

@Injectable()
export class AiToolExecutorService {
  private readonly logger = new Logger(AiToolExecutorService.name);

  /** Respaldo global si el contexto no trae la zona del negocio. */
  private readonly fallbackTimeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiCryptoService,
    private readonly appointments: AppointmentsService,
    private readonly products: ProductsService,
    config: ConfigService,
  ) {
    this.fallbackTimeZone = resolveTimeZone(config.get<string>('business.timeZone'));
  }

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
        case TOOL_CHECK_PRODUCT:
          return await this.checkProduct(input, ctx);
        case TOOL_ESCALATE_TO_HUMAN:
          return await this.escalateTool(input, ctx);
        default:
          return `Herramienta desconocida: ${toolName}`;
      }
    } catch (err) {
      this.logger.error(`Error ejecutando ${toolName}: ${(err as Error).message}`);
      return `No se pudo completar la acción: ${(err as Error).message}`;
    }
  }

  /**
   * Texto de confirmación de una herramienta SIN ejecutarla, para el chat de
   * prueba del panel. Es también el que devuelven los métodos reales tras hacer
   * el trabajo: una sola fuente de verdad, para que el dueño lea en la prueba
   * exactamente lo mismo que leería su cliente.
   */
  describeWithoutExecuting(
    toolName: string,
    input: Record<string, unknown>,
    timeZone?: string,
  ): string {
    const zona = resolveTimeZone(timeZone, this.fallbackTimeZone);
    switch (toolName) {
      case TOOL_CREATE_APPOINTMENT: {
        const scheduledAt = this.parseDate(input.scheduled_at);
        if (!scheduledAt) return 'Fecha de la cita inválida.';
        return `Cita creada para el ${formatBusinessDateTime(scheduledAt, zona)}.`;
      }
      case TOOL_CREATE_REMINDER: {
        const remindAt = this.parseDate(input.remind_at);
        if (!remindAt) return 'Fecha del recordatorio inválida.';
        return `Recordatorio creado para el ${formatBusinessDateTime(remindAt, zona)}.`;
      }
      case TOOL_UPDATE_CONTACT:
        if (typeof input.name !== 'string' && typeof input.notes !== 'string') {
          return 'No se indicó ningún campo a actualizar.';
        }
        return 'Contacto actualizado.';
      case TOOL_ESCALATE_TO_HUMAN:
        if (typeof input.motivo !== 'string' || !input.motivo.trim()) {
          return 'Falta indicar el motivo por el que no puedes resolverlo.';
        }
        return ESCALATION_RESULT;
      default:
        return `Herramienta desconocida: ${toolName}`;
    }
  }

  /**
   * Tercer disparador del handoff (RF-11): la propia IA reconoce que no puede
   * responder con seguridad. Los otros dos son manuales —el equipo desde el
   * panel— o por palabra clave del cliente (`requestsHumanAgent`).
   *
   * El motivo queda como nota interna para que quien retome la conversación
   * sepa por qué le llegó, sin tener que releer todo el hilo. La nota es interna:
   * el cliente nunca la ve.
   */
  private async escalateTool(
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    const motivo = typeof input.motivo === 'string' ? input.motivo.trim() : '';
    if (!motivo) return 'Falta indicar el motivo por el que no puedes resolverlo.';
    return this.escalateToHuman(motivo, ctx);
  }

  /**
   * Pasa la conversación a una persona dejando el motivo como nota interna.
   *
   * Es público porque no lo dispara solo el modelo: la guarda de costo escala
   * por aquí cuando se agota el presupuesto (ver `AiService`). Un único camino
   * para las dos causas — si divergieran, una de las dos dejaría la
   * conversación a medias.
   */
  async escalateToHuman(motivo: string, ctx: ConversationContext): Promise<string> {
    // `updateMany` con el tenant en el filtro: `ctx` ya es de confianza, pero
    // así ninguna conversación de otro negocio puede quedar tocada ni por error
    // de programación futuro.
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: ctx.conversationId, tenantId: ctx.tenantId },
      data: { handledBy: ConversationHandler.HUMAN },
    });
    if (count === 0) {
      return 'No se pudo escalar la conversación.';
    }

    await this.prisma.conversationNote.create({
      data: {
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        authorId: AI_AUTHOR_ID,
        authorName: AI_AUTHOR_NAME,
        body: this.pii.encrypt(`Escalado automático: ${motivo}`),
      },
    });

    this.logger.log(
      `Conversación ${ctx.conversationId} escalada por la IA (tenant ${ctx.tenantId}): ${motivo}`,
    );
    return ESCALATION_RESULT;
  }

  /**
   * Consulta el catálogo en vivo. Es de SOLO LECTURA a propósito: la IA informa
   * disponibilidad, nunca reserva ni descuenta stock. Descontar desde una
   * conversación exigiría bloqueos y una noción de pedido que no existe todavía,
   * y sin eso dos clientes podrían llevarse la misma última unidad.
   */
  private async checkProduct(
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    const consulta = typeof input.consulta === 'string' ? input.consulta.trim() : '';

    const encontrados = await this.products.searchForAi(
      ctx.tenantId,
      consulta,
      PRODUCT_SEARCH_LIMIT,
    );
    if (encontrados.length === 0) {
      // Importa distinguir "no lo tenemos" de "no lo encontré": el modelo debe
      // ofrecer confirmar con una persona, no afirmar que no existe.
      //
      // Y antes de mandar a nadie al equipo, el modelo tiene que mirar la
      // información del negocio. Este mensaje decía "dile que lo confirme con
      // el equipo" a secas, y el agente derivaba la pregunta por precios de una
      // barbería que tenía su lista de cortes escrita en el perfil: un catálogo
      // de productos vacío no significa que el negocio no haya declarado nada.
      return consulta
        ? `No hay ningún producto registrado que coincida con "${consulta}". Antes de derivar: si eso aparece en la información del negocio, respóndelo desde ahí. Si tampoco está, puede que no lo vendan o que esté guardado con otro nombre — ofrécele confirmarlo con el equipo.`
        : 'No hay productos registrados en el sistema. Eso NO significa que el negocio no venda nada: si su información incluye servicios o precios, respóndelos desde ahí. Solo si tampoco están, dile que lo confirme con el equipo.';
    }

    const lineas = encontrados.map((p) => {
      let precio: string;
      if (p.priceCents == null) {
        precio = 'precio no indicado';
      } else if (p.currency) {
        precio = `${(p.priceCents / 100).toFixed(2)} ${p.currency}`;
      } else {
        // Sin esta advertencia el modelo se inventa la moneda: en una prueba
        // real dijo "COP" para un negocio que nunca declaró ninguna.
        precio = `${(p.priceCents / 100).toFixed(2)} (el negocio no configuró la moneda: di solo la cifra, sin símbolo ni nombre de moneda)`;
      }
      const stock = p.stock > 0 ? `${p.stock} disponibles` : 'SIN STOCK';
      // El SKU NO va en el resultado, por lo mismo que no va el id de una cita:
      // el modelo repite este texto al cliente, y en una prueba real le soltó
      // "es el modelo 500ml (DEMO-01)". Un código interno del negocio no le
      // dice nada a quien pregunta. La búsqueda sí lo mira (está en
      // `searchText`), así que preguntar por el código sigue funcionando.
      return `- ${p.name}: ${precio}, ${stock}.`;
    });
    this.logger.log(
      `Catálogo consultado por la IA (tenant ${ctx.tenantId}): "${consulta || '(general)'}" -> ` +
        encontrados.map((p) => p.sku ?? p.name).join(', '),
    );

    // Una pregunta general ("¿qué venden?") no es una búsqueda: se enseña una
    // muestra y hay que decir cuántos hay en total. Sin esto, el agente daba a
    // entender que el catálogo entero eran los pocos que le llegaron.
    let encabezado: string;
    if (consulta) {
      encabezado = `Resultado del catálogo para "${consulta}":`;
    } else {
      const total = await this.products.countActive(ctx.tenantId);
      encabezado =
        total > encontrados.length
          ? `El negocio tiene ${total} productos. Estos son ${encontrados.length}; menciónalos y ofrece buscar algo concreto:`
          : 'Catálogo completo del negocio:';
    }

    return (
      `${encabezado}\n${lineas.join('\n')}\n` +
      // La consulta es de solo lectura: no hay reserva ni pedido en el sistema.
      // Sin esto el agente ofrecía "reservarlo", que nadie puede cumplir. El
      // paréntesis final hace falta porque el modelo repetía la restricción tal
      // cual al cliente ("No ofrezco reservas"), que nadie le había preguntado.
      'Informa disponibilidad y precio. No ofrezcas reservar, apartar ni encargar (no menciones esta limitación salvo que el cliente pida reservar).'
    );
  }

  private async createAppointment(
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    const scheduledAt = this.parseDate(input.scheduled_at);
    if (!scheduledAt) return 'Fecha de la cita inválida.';
    // Vía AppointmentsService (no prisma.appointment.create directo) para que
    // la cita se sincronice con Google Calendar igual que si la creara un
    // humano desde el panel — ver DECISIONS.md.
    const appt = await this.appointments.create(ctx.tenantId, {
      contactId: ctx.contactId,
      title: String(input.title ?? 'Cita'),
      scheduledAt: scheduledAt.toISOString(),
      notes: input.notes ? String(input.notes) : undefined,
    });
    // El id queda en el log del servidor (auditoría) y NO en el resultado: el
    // modelo repite este texto al cliente, y un UUID interno no debe salir por
    // WhatsApp. La fecha va en la zona del negocio, no en UTC, por lo mismo.
    this.logger.log(`Cita ${appt.id} creada por la IA (tenant ${ctx.tenantId})`);
    return this.describeWithoutExecuting(TOOL_CREATE_APPOINTMENT, input, ctx.timeZone);
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
    this.logger.log(`Recordatorio ${reminder.id} creado por la IA (tenant ${ctx.tenantId})`);
    return this.describeWithoutExecuting(TOOL_CREATE_REMINDER, input, ctx.timeZone);
  }

  private async updateContact(
    input: Record<string, unknown>,
    ctx: ConversationContext,
  ): Promise<string> {
    const data: { name?: string; notes?: string } = {};
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.notes === 'string') data.notes = this.pii.encrypt(input.notes);
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
