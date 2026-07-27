import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessageSender } from '@prisma/client';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { KnowledgeRetrievalService } from '../knowledge/knowledge-retrieval.service';
import { AiContextMemoryService } from './ai-context-memory.service';
import { AI_TOOLS, AiToolExecutorService } from './ai-tool-executor.service';
import {
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ITERATIONS,
  READ_ONLY_TOOLS,
  TOOL_ESCALATE_TO_HUMAN,
} from './ai.constants';
import { describeNow, resolveTimeZone } from './ai-datetime.util';
import { AiUsageService } from './ai-usage.service';
import { NvidiaChatService } from './nvidia-chat.service';
import { AgentReply, ConversationContext, HistoryTurn, TokenUsage, ToolIntent } from './ai.types';
import type { ToolRunner } from './nvidia-chat.service';

/** Cuál de los tres techos de costo se alcanzó. */
export type RateLimitReason = 'conversacion-hora' | 'negocio-hora' | 'negocio-dia';

/**
 * Motivo que se deja como nota interna al escalar por costo. Lo lee el equipo,
 * no el cliente: dice qué pasó y qué mirar, sin jerga de la implementación.
 */
const MOTIVOS_DE_COSTE: Record<RateLimitReason, string> = {
  'conversacion-hora':
    'esta conversación agotó su límite de respuestas automáticas por hora (puede ser un bucle o un cliente muy insistente)',
  'negocio-hora':
    'el negocio agotó su límite de respuestas automáticas por hora: hay un pico de tráfico',
  'negocio-dia':
    'el negocio agotó su límite de respuestas automáticas del día',
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly provider: string;
  private readonly model: string;
  private readonly maxCallsPerHour: number;
  private readonly maxCallsPerTenantPerHour: number;
  private readonly maxCallsPerTenantPerDay: number;
  private readonly timeZone: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tools: AiToolExecutorService,
    private readonly contextMemory: AiContextMemoryService,
    private readonly businessProfile: BusinessProfileService,
    private readonly knowledge: KnowledgeRetrievalService,
    private readonly nvidia: NvidiaChatService,
    private readonly usage: AiUsageService,
  ) {
    const apiKey = this.config.get<string>('ai.apiKey') ?? '';
    this.provider = this.config.get<string>('ai.provider') ?? 'anthropic';
    this.model = this.config.get<string>('ai.model') ?? 'claude-haiku-4-5';
    this.maxCallsPerHour =
      this.config.get<number>('ai.maxCallsPerConversationPerHour') ?? 20;
    this.maxCallsPerTenantPerHour = this.config.get<number>('ai.maxCallsPerTenantPerHour') ?? 200;
    this.maxCallsPerTenantPerDay = this.config.get<number>('ai.maxCallsPerTenantPerDay') ?? 1500;
    this.timeZone = resolveTimeZone(this.config.get<string>('business.timeZone'));
    // Sin API key la IA queda deshabilitada (arranque local sin credenciales).
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /**
   * Modelo que de verdad atendió la llamada. Importa para el histórico de
   * gasto: los tokens de dos modelos no cuestan lo mismo, así que apuntar
   * siempre el de Anthropic dejaría el registro sin poder valorarse.
   */
  private activeModel(): string {
    return this.provider === 'nvidia'
      ? (this.config.get<string>('ai.nvidia.model') ?? 'nvidia')
      : this.model;
  }

  /** La IA opera si es modo mock, o si el proveedor activo tiene credenciales. */
  isEnabled(): boolean {
    if (this.provider === 'mock') return true;
    if (this.provider === 'nvidia') return this.nvidia.isEnabled();
    return this.client !== null;
  }

  /**
   * Guarda de costo (NFR). Tres techos, y hacen falta los tres:
   *
   * - **por conversación/hora**: ataja un bucle o un cliente pesado concreto,
   *   pero no ve nada si el gasto se reparte entre muchas conversaciones;
   * - **por negocio/hora**: ataja el pico repentino (una campaña, un número
   *   filtrado) que ninguna conversación sola delata;
   * - **por negocio/día**: ataja el goteo sostenido, que por hora nunca llega
   *   al techo pero al final del mes está en la factura.
   *
   * Se cuentan los mensajes generados por la IA como proxy de las llamadas.
   * **Es un proxy conservador a la baja**: una respuesta con tool-calling gasta
   * hasta `MAX_TOOL_ITERATIONS` llamadas y aquí cuenta como una. Sirve para
   * poner un tope, no para facturar.
   */
  async withinRateLimit(
    conversationId: string,
    tenantId?: string,
  ): Promise<{ allowed: boolean; reason?: RateLimitReason }> {
    const ahora = Date.now();
    const haceUnaHora = new Date(ahora - 60 * 60 * 1000);

    const enConversacion = await this.prisma.message.count({
      where: { conversationId, sender: MessageSender.AI, createdAt: { gte: haceUnaHora } },
    });
    if (enConversacion >= this.maxCallsPerHour) {
      return { allowed: false, reason: 'conversacion-hora' };
    }

    // `tenantId` opcional por compatibilidad: sin él solo se aplica el techo de
    // la conversación, que es como se comportaba antes.
    if (!tenantId) return { allowed: true };

    const haceUnDia = new Date(ahora - 24 * 60 * 60 * 1000);
    const [enHora, enDia] = await this.prisma.$transaction([
      this.prisma.message.count({
        where: { tenantId, sender: MessageSender.AI, createdAt: { gte: haceUnaHora } },
      }),
      this.prisma.message.count({
        where: { tenantId, sender: MessageSender.AI, createdAt: { gte: haceUnDia } },
      }),
    ]);

    if (enHora >= this.maxCallsPerTenantPerHour) {
      return { allowed: false, reason: 'negocio-hora' };
    }
    if (enDia >= this.maxCallsPerTenantPerDay) {
      return { allowed: false, reason: 'negocio-dia' };
    }
    return { allowed: true };
  }

  /**
   * Qué hacer cuando se agota el presupuesto: pasar la conversación a una
   * persona, no callarse.
   *
   * Antes, al tocar techo, el cliente simplemente no recibía respuesta — desde
   * su lado, el negocio lo dejó en visto. Escalar reutiliza el mismo camino que
   * cuando la IA no sabe algo: el equipo lo ve en la bandeja con el motivo.
   */
  async escalateForCostLimit(
    ctx: ConversationContext,
    reason: RateLimitReason,
  ): Promise<void> {
    this.logger.warn(
      `Guarda de costo (${reason}) alcanzada en conversación ${ctx.conversationId}; ` +
        'se escala a una persona en vez de dejar al cliente sin respuesta',
    );
    await this.tools.escalateToHuman(MOTIVOS_DE_COSTE[reason], ctx);
  }

  /**
   * Genera una respuesta contextual para el último mensaje del cliente,
   * ejecutando herramientas (citas/recordatorios/contacto) cuando corresponda.
   *
   * `simulateTools` es para el chat de prueba del panel: el agente razona y
   * decide igual, pero las herramientas NO tocan la base de datos — se devuelve
   * en `simulatedTools` lo que habría hecho. Probar el agente no puede crear
   * citas reales en la agenda del negocio.
   */
  async respond(
    ctx: ConversationContext,
    history: HistoryTurn[],
    options: { simulateTools?: boolean } = {},
  ): Promise<AgentReply> {
    // Fase 4: recuerdos de conversaciones anteriores del mismo contacto,
    // relevantes para su último mensaje (nunca cruza tenants ni contactos).
    // Se calcula siempre (incluso en modo mock) para poder probar toda la
    // tubería de memoria localmente sin gastar créditos.
    const lastUserText = [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
    const recalled = await this.contextMemory.recall(ctx.tenantId, ctx.contactId, lastUserText);
    const profileLines = await this.businessProfile.describe(ctx.tenantId);
    // La zona es de ESTE negocio, no de la plataforma: dos clientes en husos
    // distintos agendarían a horas distintas con un único valor global.
    // Se resuelve una vez por respuesta y viaja en el contexto hasta las
    // herramientas, que confirman la hora al cliente.
    const ctxConZona: ConversationContext = {
      ...ctx,
      timeZone: resolveTimeZone(await this.businessProfile.timeZoneOf(ctx.tenantId), this.timeZone),
    };
    // Documentación del negocio relevante a este mensaje: solo los fragmentos
    // más parecidos, no los documentos completos — el system prompt se paga en
    // cada mensaje (ver KnowledgeRetrievalService).
    const knowledgeLines = await this.knowledge.describe(ctx.tenantId, lastUserText);

    // Un único punto de ejecución de herramientas para los tres proveedores: o
    // se ejecutan de verdad, o se registran sin efecto para el chat de prueba.
    const simulated: ToolIntent[] = [];
    const runTool = options.simulateTools
      ? async (name: string, input: Record<string, unknown>): Promise<string> => {
          // Las de solo lectura se ejecutan igual: simular una consulta al
          // catálogo devolvería productos inventados (ver READ_ONLY_TOOLS).
          if (READ_ONLY_TOOLS.has(name)) return this.tools.execute(name, input, ctxConZona);
          simulated.push({ name, input });
          return this.tools.describeWithoutExecuting(name, input, ctxConZona.timeZone);
        }
      : (name: string, input: Record<string, unknown>): Promise<string> =>
          this.tools.execute(name, input, ctxConZona);

    let reply: AgentReply;
    if (this.provider === 'mock') {
      reply = await this.mockRespond(ctxConZona, history, runTool);
    } else {
      const system = this.buildSystemPrompt(ctxConZona, recalled, profileLines, knowledgeLines);
      // El proveedor de pruebas recibe el MISMO system prompt y las MISMAS
      // herramientas; solo cambia el transporte (ver NvidiaChatService).
      reply =
        this.provider === 'nvidia'
          ? await this.nvidia.respond(system, history, runTool)
          : await this.anthropicRespond(system, history, runTool);
    }

    // Si el bucle se agota (o el modelo no devuelve texto), el cliente igual
    // recibe una respuesta de cierre. Al garantizar texto no vacío, el mensaje
    // se persiste y la guarda de costo cuenta esta llamada (corrige que una
    // respuesta vacía se pagara sin contar).
    const text =
      reply.text ||
      (reply.actions.length > 0
        ? 'Listo, ya lo registré. ¿Necesitas algo más?'
        : '¿Podrías darme un poco más de detalle para ayudarte mejor?');

    // Se apunta lo gastado aunque el modelo no devolviera texto útil: la llamada
    // se pagó igual, y ocultarlo falsearía el histórico justo en los casos malos.
    if (reply.usage) {
      await this.usage.record({
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        provider: this.provider,
        model: this.activeModel(),
        purpose: 'respond',
        usage: reply.usage,
      });
    }

    return options.simulateTools
      ? { text, actions: reply.actions, simulatedTools: simulated }
      : { text, actions: reply.actions };
  }

  /** Bucle de tool-calling contra la API de Anthropic (proveedor de producción). */
  private async anthropicRespond(
    system: string,
    history: HistoryTurn[],
    run: ToolRunner,
  ): Promise<AgentReply> {
    if (!this.client) {
      throw new Error('IA deshabilitada: falta ANTHROPIC_API_KEY');
    }

    const messages: Anthropic.MessageParam[] = history.map((turn) => ({
      role: turn.role,
      content: turn.text,
    }));

    const actions: string[] = [];
    let replyText = '';
    // Se acumula a lo largo del bucle: cada vuelta de tool-calling es una
    // llamada facturable más.
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        tools: AI_TOOLS,
        messages,
      });
      usage.calls += 1;
      usage.inputTokens += response.usage?.input_tokens ?? 0;
      usage.outputTokens += response.usage?.output_tokens ?? 0;

      // Acumula el texto de esta respuesta.
      replyText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      if (response.stop_reason !== 'tool_use') {
        break; // respuesta final
      }

      // Ejecuta cada herramienta y devuelve los resultados en un solo turno.
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await run(block.name, block.input as Record<string, unknown>);
          actions.push(block.name);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { text: replyText, actions, usage };
  }

  /**
   * Proveedor simulado para pruebas locales sin gastar créditos de API.
   * Devuelve una respuesta contextual y, si el cliente menciona una cita,
   * ejecuta el tool-calling real contra la BD (valida toda la cadena).
   */
  private async mockRespond(
    ctx: ConversationContext,
    history: HistoryTurn[],
    run: ToolRunner,
  ): Promise<AgentReply> {
    const lastUser =
      [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
    const nombre = ctx.contactName ?? '';
    const actions: string[] = [];

    // Escalado simulado: permite probar toda la cadena del handoff por baja
    // confianza (nota interna incluida) sin gastar créditos de API.
    if (/\b(reclamo|queja|devoluci[oó]n|reembolso)\b/i.test(lastUser)) {
      const result = await run(TOOL_ESCALATE_TO_HUMAN, {
        motivo: 'consulta simulada que el agente no puede resolver',
      });
      actions.push(TOOL_ESCALATE_TO_HUMAN);
      return {
        text: `Gracias por contarme, ${nombre}. ${result} [respuesta simulada — modo pruebas sin créditos]`.trim(),
        actions,
      };
    }

    if (/\b(cita|agendar|agenda|turno|reservar)\b/i.test(lastUser)) {
      const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await run('create_appointment', {
        title: 'Consulta (simulada)',
        scheduled_at: scheduledAt,
      });
      actions.push('create_appointment');
      return {
        text: `¡Claro, ${nombre}! Te dejé agendada una cita de ejemplo. ${result} [respuesta simulada — modo pruebas sin créditos]`.trim(),
        actions,
      };
    }

    return {
      text: `Hola ${nombre}, gracias por escribir. ¿En qué puedo ayudarte? [respuesta simulada — modo pruebas sin créditos]`.trim(),
      actions,
    };
  }

  /**
   * Arma el system prompt con todo el contexto del negocio. Es una función pura
   * sobre sus argumentos a propósito: el panel "Agente IA" la usa (vía
   * `previewSystemPrompt`) para mostrarle al dueño exactamente el contexto que
   * va a recibir la IA, sin tener que duplicar la lógica en otro lado.
   */
  buildSystemPrompt(
    ctx: ConversationContext,
    recalled: string[] = [],
    profileLines: string[] = [],
    knowledgeLines: string[] = [],
    // Parámetro y no `new Date()` interno para que la función siga siendo pura
    // sobre sus argumentos (los tests fijan la fecha; el panel muestra la real).
    now: Date = new Date(),
  ): string {
    const lines = [
      `Eres el asistente de IA de la empresa "${ctx.tenantName}", atendiendo por WhatsApp.`,
      `Hablas con el contacto ${ctx.contactName ?? 'sin nombre'} (teléfono ${ctx.contactPhone}).`,
      // La zona viene resuelta en el contexto (la del negocio); `this.timeZone`
      // es solo el respaldo global para quien llame sin ella.
      ...describeNow(now, ctx.timeZone ?? this.timeZone),
      'Responde en español, de forma breve, cordial y útil.',
      'Usa las herramientas disponibles para programar citas, crear recordatorios o actualizar los datos del contacto cuando el cliente lo pida.',
      'No inventes información del negocio que no conozcas.',
      // Sin esto el modelo prefiere improvisar antes que reconocer que no sabe:
      // en una prueba real se inventó una moneda que el negocio nunca declaró.
      'Si no puedes responder con seguridad, escala la conversación a una persona del equipo en vez de improvisar. Escala cuando: te falte un dato que no está en la información del negocio, el cliente reclame o esté molesto, pida algo que tú no puedes hacer, o se trate de dinero, condiciones o compromisos que el negocio no dejó por escrito.',
      // El contrapeso importa tanto como la instrucción: un agente que escala
      // todo le devuelve al dueño el trabajo que venía a quitarle.
      'No escales por costumbre ni por cortesía: si la información que tienes alcanza para responder, responde tú. Escalar todo deja al negocio sin asistente.',
    ];
    if (profileLines.length > 0) {
      lines.push('Esto es lo que el negocio configuró para que lo tengas en cuenta:', ...profileLines);
    }
    if (knowledgeLines.length > 0) {
      lines.push(...knowledgeLines);
    }
    if (recalled.length > 0) {
      lines.push(
        'Esto es lo que sabes de conversaciones anteriores con este mismo cliente (puede ayudarte a dar continuidad, pero no lo repitas textualmente ni asumas que sigue siendo exacto):',
        ...recalled.map((r) => `- ${r}`),
      );
    }
    return lines.join('\n');
  }

  /**
   * System prompt de ejemplo para el panel: mismo armado que en una respuesta
   * real, con un contacto de muestra y una consulta de prueba para que se vea qué
   * documentación se recupera. Sirve para que el dueño entienda —y audite— qué
   * sabe la IA antes de que atienda a un cliente real.
   */
  async previewSystemPrompt(
    tenantId: string,
    tenantName: string,
    sampleQuery: string,
  ): Promise<{ prompt: string; knowledgeUsed: number }> {
    const profileLines = await this.businessProfile.describe(tenantId);
    const knowledgeLines = await this.knowledge.describe(tenantId, sampleQuery);
    const prompt = this.buildSystemPrompt(
      {
        tenantId,
        tenantName,
        contactId: 'preview',
        contactName: 'Cliente de ejemplo',
        contactPhone: '+00000000000',
        conversationId: 'preview',
        // Con la zona real del negocio: la vista previa existe para que el dueño
        // audite lo que sabe su agente, y mostrarle otra hora sería engañarlo.
        timeZone: resolveTimeZone(await this.businessProfile.timeZoneOf(tenantId), this.timeZone),
      },
      [],
      profileLines,
      knowledgeLines,
    );
    // La primera línea del bloque es el encabezado, el resto son fragmentos.
    const knowledgeUsed = knowledgeLines.length > 0 ? knowledgeLines.length - 1 : 0;
    return { prompt, knowledgeUsed };
  }

  /**
   * Tokens de un prompt. Usa el endpoint de conteo de Anthropic cuando hay API
   * key (no consume tokens de facturación, solo una llamada) y cae a una
   * estimación local si no.
   *
   * `estimated: true` viaja hasta la interfaz para mostrarlo como aproximado:
   * presentar una cuenta local como si fuera exacta sería engañar al dueño sobre
   * lo que le va a costar cada mensaje.
   */
  async countPromptTokens(prompt: string): Promise<{ tokens: number; estimated: boolean }> {
    if (this.client) {
      try {
        const result = await this.client.messages.countTokens({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
        });
        return { tokens: result.input_tokens, estimated: false };
      } catch (err) {
        this.logger.warn(
          `No se pudo contar tokens con la API, se estima localmente: ${(err as Error).message}`,
        );
      }
    }
    // ~4 caracteres por token es la regla gruesa habitual para español/inglés.
    // Es una estimación, y como tal se etiqueta.
    return { tokens: Math.ceil(prompt.length / 4), estimated: true };
  }

}
