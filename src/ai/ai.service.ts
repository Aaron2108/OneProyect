import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessageSender } from '@prisma/client';
import { AI_TOOLS, AiToolExecutorService } from './ai-tool-executor.service';
import { MAX_OUTPUT_TOKENS, MAX_TOOL_ITERATIONS } from './ai.constants';
import { AgentReply, ConversationContext, HistoryTurn } from './ai.types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly maxCallsPerHour: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tools: AiToolExecutorService,
  ) {
    const apiKey = this.config.get<string>('ai.apiKey') ?? '';
    this.model = this.config.get<string>('ai.model') ?? 'claude-haiku-4-5';
    this.maxCallsPerHour =
      this.config.get<number>('ai.maxCallsPerConversationPerHour') ?? 20;
    // Sin API key la IA queda deshabilitada (arranque local sin credenciales).
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /** La IA solo opera si hay API key configurada. */
  isEnabled(): boolean {
    return this.client !== null;
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
        system: this.buildSystemPrompt(ctx),
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

    return { text: replyText, actions };
  }

  private buildSystemPrompt(ctx: ConversationContext): string {
    return [
      `Eres el asistente de IA de la empresa "${ctx.tenantName}", atendiendo por WhatsApp.`,
      `Hablas con el contacto ${ctx.contactName ?? 'sin nombre'} (teléfono ${ctx.contactPhone}).`,
      'Responde en español, de forma breve, cordial y útil.',
      'Usa las herramientas disponibles para programar citas, crear recordatorios o actualizar los datos del contacto cuando el cliente lo pida.',
      'No inventes información del negocio que no conozcas; si no puedes resolver algo, indícalo con claridad.',
    ].join(' ');
  }
}
