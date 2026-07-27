import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { AiPurpose, AiUsageService } from './ai-usage.service';
import { MAX_SUMMARY_TOKENS } from './ai.constants';
import { ConversationContext, HistoryTurn } from './ai.types';

/** De dónde sale la llamada, para poder imputarle el gasto al negocio. */
interface Origen {
  tenantId: string;
  conversationId?: string;
}

/**
 * Textos cortos que la IA escribe **fuera** de una conversación: resúmenes y
 * mensajes de seguimiento.
 *
 * Se separan de `AiService` porque son otra cosa: una sola llamada al modelo,
 * sin herramientas, sin historial que mantener y sin nadie esperando al otro
 * lado de WhatsApp. `AiService` lleva el bucle de tool-calling y la guarda de
 * costo; aquí no hace falta nada de eso.
 *
 * Las tres funciones compartían el mismo esqueleto repetido —armar la
 * transcripción, llamar, apuntar el gasto, extraer el texto—, así que ese
 * esqueleto vive una sola vez en `oneShot()`.
 */
@Injectable()
export class AiWriterService {
  private readonly client: Anthropic | null;
  private readonly provider: string;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly usage: AiUsageService,
    private readonly businessProfile: BusinessProfileService,
  ) {
    const apiKey = this.config.get<string>('ai.apiKey') ?? '';
    this.provider = this.config.get<string>('ai.provider') ?? 'anthropic';
    this.model = this.config.get<string>('ai.model') ?? 'claude-haiku-4-5';
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /** Sin credenciales o en modo simulado no se llama al modelo: se devuelve texto de prueba. */
  private get simulado(): boolean {
    return this.provider === 'mock' || !this.client;
  }

  /**
   * Resume una conversación cerrada en 1-2 frases como **memoria de la IA**:
   * la nota que el propio agente leerá la próxima vez que escriba este mismo
   * cliente (ver `AiContextMemoryService`). Lo llama `ConversationsService` al
   * cerrar.
   */
  async summarize(history: HistoryTurn[], origen?: Origen): Promise<string> {
    if (history.length === 0) return '';
    if (this.simulado) {
      const ultimo = [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
      return ultimo ? `Conversación simulada; último mensaje del cliente: "${ultimo}".` : '';
    }
    return this.oneShot({
      system:
        'Resume la siguiente conversación de atención al cliente en 1-2 frases breves, en español, pensadas para que el equipo recuerde el contexto en una conversación futura con el mismo cliente (qué quería, qué se resolvió). No inventes datos que no estén en la conversación.',
      user: transcribir(history),
      purpose: 'summarize',
      origen,
    });
  }

  /**
   * Resume una conversación **para el equipo**, no para la IA.
   *
   * `summarize` produce memoria. Esto lo lee una persona que abre la bandeja y
   * necesita entender en diez segundos qué quería el cliente, qué se le dijo y
   * qué queda pendiente. Mismo material de entrada, lector distinto, así que
   * prompt distinto.
   */
  async summarizeForTeam(history: HistoryTurn[], origen: Origen): Promise<string> {
    if (history.length === 0) return '';
    if (this.simulado) {
      return `Resumen simulado de ${history.length} mensajes. [modo pruebas sin créditos]`;
    }
    return this.oneShot({
      system: [
        'Resume esta conversación de atención al cliente para el equipo del negocio, en español.',
        'Escribe 2-4 frases que respondan: qué quería el cliente, qué se le respondió o se acordó, y qué queda pendiente.',
        'Si no queda nada pendiente, dilo. Si la conversación quedó a medias o el cliente no volvió a responder, dilo también.',
        // Sin esto el modelo rellena huecos y el equipo actúa sobre algo que
        // nadie dijo — el peor fallo posible en un resumen operativo.
        'No inventes nada que no esté en la conversación: si un dato no aparece, no lo menciones.',
        'No saludes ni te dirijas al cliente: es una nota interna.',
      ].join('\n'),
      user: transcribir(history),
      purpose: 'team-summary',
      origen,
    });
  }

  /**
   * Mensaje breve de seguimiento cuando el contacto dejó de responder (Fase 4,
   * seguimiento automático). Usa el tono configurado por el negocio para que no
   * suene genérico. Lo llama `ConversationFollowUpService`.
   */
  async generateFollowUp(ctx: ConversationContext, history: HistoryTurn[]): Promise<string> {
    if (this.simulado) {
      const saludo = ctx.contactName ? `Hola ${ctx.contactName}` : 'Hola';
      return `${saludo}, solo quería saber si seguís por ahí. Cualquier cosa, contame. [seguimiento simulado — modo pruebas sin créditos]`;
    }
    const profileLines = await this.businessProfile.describe(ctx.tenantId);
    return this.oneShot({
      system: [
        `Eres el asistente de "${ctx.tenantName}" en WhatsApp.`,
        `El contacto ${ctx.contactName ?? ''} no respondió al último mensaje de la conversación.`,
        'Escribe un único mensaje breve de seguimiento, cordial, en español, sin sonar insistente ni robótico. No repitas literalmente el mensaje anterior ni inventes información del negocio.',
        ...profileLines,
      ].join('\n'),
      user: transcribir(history) || 'Sin mensajes previos.',
      purpose: 'follow-up',
      origen: { tenantId: ctx.tenantId, conversationId: ctx.conversationId },
    });
  }

  /**
   * Una llamada, un texto. Apunta el gasto antes de devolver: la llamada ya se
   * pagó aunque el modelo no haya dicho nada aprovechable.
   */
  private async oneShot(params: {
    system: string;
    user: string;
    purpose: AiPurpose;
    origen?: Origen;
  }): Promise<string> {
    const response = await this.client!.messages.create({
      model: this.model,
      max_tokens: MAX_SUMMARY_TOKENS,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
    });

    // Sin origen no se puede imputar a ningún negocio; se prefiere no apuntarlo
    // a inventarle el gasto a alguien.
    if (params.origen) {
      await this.usage.record({
        tenantId: params.origen.tenantId,
        conversationId: params.origen.conversationId,
        provider: this.provider,
        model: this.model,
        purpose: params.purpose,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          calls: 1,
        },
      });
    }

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
  }
}

/** La conversación como texto plano, que es lo que lee el modelo. */
function transcribir(history: HistoryTurn[]): string {
  return history
    .map((t) => `${t.role === 'user' ? 'Cliente' : 'Agente'}: ${t.text}`)
    .join('\n');
}
