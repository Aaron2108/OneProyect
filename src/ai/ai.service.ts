import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessageSender } from '@prisma/client';
import { AiContextMemoryService } from './ai-context-memory.service';
import { AI_TOOLS, AiToolExecutorService } from './ai-tool-executor.service';
import { MAX_OUTPUT_TOKENS, MAX_SUMMARY_TOKENS, MAX_TOOL_ITERATIONS } from './ai.constants';
import { AgentReply, ConversationContext, HistoryTurn } from './ai.types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly provider: string;
  private readonly model: string;
  private readonly maxCallsPerHour: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tools: AiToolExecutorService,
    private readonly contextMemory: AiContextMemoryService,
  ) {
    const apiKey = this.config.get<string>('ai.apiKey') ?? '';
    this.provider = this.config.get<string>('ai.provider') ?? 'anthropic';
    this.model = this.config.get<string>('ai.model') ?? 'claude-haiku-4-5';
    this.maxCallsPerHour =
      this.config.get<number>('ai.maxCallsPerConversationPerHour') ?? 20;
    // Sin API key la IA queda deshabilitada (arranque local sin credenciales).
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /** La IA opera si es modo mock, o si hay API key configurada. */
  isEnabled(): boolean {
    return this.provider === 'mock' || this.client !== null;
  }

  /**
   * Guarda de costo (NFR): limita las llamadas a la IA por conversación en la
   * última hora. Cuenta los mensajes generados por la IA como proxy de llamadas.
   */
  async withinRateLimit(conversationId: string): Promise<boolean> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.message.count({
      where: {
        conversationId,
        sender: MessageSender.AI,
        createdAt: { gte: since },
      },
    });
    return count < this.maxCallsPerHour;
  }

  /**
   * Genera una respuesta contextual para el último mensaje del cliente,
   * ejecutando herramientas (citas/recordatorios/contacto) cuando corresponda.
   */
  async respond(ctx: ConversationContext, history: HistoryTurn[]): Promise<AgentReply> {
    // Fase 4: recuerdos de conversaciones anteriores del mismo contacto,
    // relevantes para su último mensaje (nunca cruza tenants ni contactos).
    // Se calcula siempre (incluso en modo mock) para poder probar toda la
    // tubería de memoria localmente sin gastar créditos.
    const lastUserText = [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
    const recalled = await this.contextMemory.recall(ctx.tenantId, ctx.contactId, lastUserText);

    if (this.provider === 'mock') {
      return this.mockRespond(ctx, history);
    }
    if (!this.client) {
      throw new Error('IA deshabilitada: falta ANTHROPIC_API_KEY');
    }

    const messages: Anthropic.MessageParam[] = history.map((turn) => ({
      role: turn.role,
      content: turn.text,
    }));

    const actions: string[] = [];
    let replyText = '';

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: this.buildSystemPrompt(ctx, recalled),
        tools: AI_TOOLS,
        messages,
      });

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
          const result = await this.tools.execute(
            block.name,
            block.input as Record<string, unknown>,
            ctx,
          );
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

    // Si el bucle se agota (o el modelo no devuelve texto), el cliente igual
    // recibe una respuesta de cierre. Al garantizar texto no vacío, el mensaje
    // se persiste y la guarda de costo cuenta esta llamada (corrige que una
    // respuesta vacía se pagara sin contar).
    if (!replyText) {
      replyText =
        actions.length > 0
          ? 'Listo, ya lo registré. ¿Necesitas algo más?'
          : '¿Podrías darme un poco más de detalle para ayudarte mejor?';
    }

    return { text: replyText, actions };
  }

  /**
   * Proveedor simulado para pruebas locales sin gastar créditos de API.
   * Devuelve una respuesta contextual y, si el cliente menciona una cita,
   * ejecuta el tool-calling real contra la BD (valida toda la cadena).
   */
  private async mockRespond(
    ctx: ConversationContext,
    history: HistoryTurn[],
  ): Promise<AgentReply> {
    const lastUser =
      [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
    const nombre = ctx.contactName ?? '';
    const actions: string[] = [];

    if (/\b(cita|agendar|agenda|turno|reservar)\b/i.test(lastUser)) {
      const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await this.tools.execute(
        'create_appointment',
        { title: 'Consulta (simulada)', scheduled_at: scheduledAt },
        ctx,
      );
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

  private buildSystemPrompt(ctx: ConversationContext, recalled: string[] = []): string {
    const lines = [
      `Eres el asistente de IA de la empresa "${ctx.tenantName}", atendiendo por WhatsApp.`,
      `Hablas con el contacto ${ctx.contactName ?? 'sin nombre'} (teléfono ${ctx.contactPhone}).`,
      'Responde en español, de forma breve, cordial y útil.',
      'Usa las herramientas disponibles para programar citas, crear recordatorios o actualizar los datos del contacto cuando el cliente lo pida.',
      'No inventes información del negocio que no conozcas; si no puedes resolver algo, indícalo con claridad.',
    ];
    if (recalled.length > 0) {
      lines.push(
        'Esto es lo que sabes de conversaciones anteriores con este mismo cliente (puede ayudarte a dar continuidad, pero no lo repitas textualmente ni asumas que sigue siendo exacto):',
        ...recalled.map((r) => `- ${r}`),
      );
    }
    return lines.join('\n');
  }

  /**
   * Resume una conversación ya cerrada en 1-2 frases (Fase 4, memoria de
   * contexto): lo llama `ConversationsService` al cerrar una conversación,
   * para guardar el resumen como recuerdo del contacto (ver
   * `AiContextMemoryService`). En modo mock no gasta créditos.
   */
  async summarize(history: HistoryTurn[]): Promise<string> {
    if (history.length === 0) return '';
    if (this.provider === 'mock' || !this.client) {
      return this.mockSummarize(history);
    }
    const transcript = history
      .map((t) => `${t.role === 'user' ? 'Cliente' : 'Agente'}: ${t.text}`)
      .join('\n');
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_SUMMARY_TOKENS,
      system:
        'Resume la siguiente conversación de atención al cliente en 1-2 frases breves, en español, pensadas para que el equipo recuerde el contexto en una conversación futura con el mismo cliente (qué quería, qué se resolvió). No inventes datos que no estén en la conversación.',
      messages: [{ role: 'user', content: transcript }],
    });
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
  }

  /** Resumen simulado (sin IA real) para pruebas locales de la tubería de memoria. */
  private mockSummarize(history: HistoryTurn[]): string {
    const lastUser = [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
    return lastUser
      ? `Conversación simulada; último mensaje del cliente: "${lastUser}".`
      : '';
  }
}
