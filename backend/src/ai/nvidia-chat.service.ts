import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Anthropic from '@anthropic-ai/sdk';
import { AI_TOOLS } from './ai-tool-executor.service';
import {
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ITERATIONS,
  NVIDIA_REQUEST_TIMEOUT_MS,
} from './ai.constants';
import { AgentReply, HistoryTurn, TokenUsage } from './ai.types';

/**
 * Proveedor de pruebas compatible con la API de OpenAI (NVIDIA NIM), para poder
 * ejercitar el agente real —incluido el tool-calling contra la BD— sin créditos
 * de Anthropic. Se activa con `AI_PROVIDER=nvidia`.
 *
 * Es un proveedor **temporal de testeo**, no la arquitectura objetivo: el agente
 * de producción es Claude (ver DECISIONS.md). Por eso este servicio se limita a
 * traducir el formato de herramientas de Anthropic al de OpenAI y a correr el
 * mismo bucle de tool-calling, sin tocar el resto del motor: el system prompt,
 * las herramientas y el contexto del negocio son exactamente los mismos.
 */

/** Ejecuta una herramienta ya validada y devuelve su resultado como texto. */
export type ToolRunner = (
  name: string,
  input: Record<string, unknown>,
) => Promise<string>;

interface OpenAiTool {
  type: 'function';
  function: { name: string; description?: string; parameters: unknown };
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiChatCompletion {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
  }>;
  // Nombres de OpenAI, no de Anthropic: `prompt`/`completion` en vez de
  // `input`/`output`. Opcional porque no todo proveedor compatible lo devuelve.
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Traduce una herramienta del formato Anthropic (`input_schema`) al de OpenAI
 * (`function.parameters`). El JSON Schema en sí es idéntico en ambos: solo
 * cambia el envoltorio, así que las herramientas se definen una sola vez en
 * `AI_TOOLS` y no hay riesgo de que las dos listas se desincronicen.
 */
function toOpenAiTool(tool: Anthropic.Tool): OpenAiTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/**
 * Etiquetas con las que estos modelos envuelven su salida. No son parte del
 * mensaje: son andamiaje que a veces se les escapa.
 */
const ETIQUETAS_DE_ANDAMIO = ['think', 'thinking', 'response', 'answer', 'output', 'final'];

/**
 * Limpia el texto antes de que salga hacia el cliente.
 *
 * Quita el razonamiento intercalado (`<think>…</think>`) y también las
 * etiquetas sueltas de esa familia: en una prueba real llegó un mensaje que
 * empezaba con `<response>` literal, porque el modelo abrió la etiqueta y no la
 * cerró. Se limita a una lista conocida a propósito — borrar cualquier `<…>`
 * destrozaría un mensaje legítimo que hable de tallas o de precios ("<10 soles").
 */
function stripReasoning(text: string): string {
  const nombres = ETIQUETAS_DE_ANDAMIO.join('|');
  return text
    // Bloques completos, con su contenido: es razonamiento, no respuesta.
    .replace(new RegExp(`<(${nombres})>[\\s\\S]*?</\\1>`, 'gi'), '')
    // Etiquetas huérfanas (abiertas y nunca cerradas, o al revés).
    .replace(new RegExp(`</?(${nombres})>`, 'gi'), '')
    .trim();
}

/** Los argumentos llegan como string JSON; si no es un objeto válido, null. */
function parseToolArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

@Injectable()
export class NvidiaChatService {
  private readonly logger = new Logger(NvidiaChatService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly tools: OpenAiTool[];

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ai.nvidia.apiKey') ?? '';
    this.model = this.config.get<string>('ai.nvidia.model') ?? '';
    this.baseUrl = this.config.get<string>('ai.nvidia.baseUrl') ?? '';
    this.tools = AI_TOOLS.map(toOpenAiTool);
  }

  isEnabled(): boolean {
    return !!this.apiKey;
  }

  /**
   * Misma firma conceptual que el camino de Anthropic: recibe el system prompt ya
   * armado y el historial, y devuelve el texto final más las acciones ejecutadas.
   * El texto vacío lo resuelve `AiService` (respaldo común a los dos proveedores).
   */
  async respond(
    system: string,
    history: HistoryTurn[],
    run: ToolRunner,
  ): Promise<AgentReply> {
    if (!this.apiKey) {
      throw new Error('IA deshabilitada: falta NVIDIA_API_KEY');
    }

    const messages: OpenAiMessage[] = [
      { role: 'system', content: system },
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    ];

    const actions: string[] = [];
    let replyText = '';
    // Se acumula a lo largo del bucle: cada vuelta de tool-calling es una
    // llamada facturable más.
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const message = await this.complete(messages, usage);
      replyText = stripReasoning(message.content ?? '');

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        break; // respuesta final
      }

      // El turno del asistente debe conservar los tool_calls: el proveedor
      // rechaza un mensaje `tool` que no responda a una llamada previa.
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const input = parseToolArguments(call.function.arguments);
        let result: string;
        if (input) {
          result = await run(call.function.name, input);
          actions.push(call.function.name);
        } else {
          // Argumentos ilegibles: se le informa al modelo como resultado de la
          // herramienta para que pueda corregir, en vez de cortar la conversación.
          this.logger.warn(
            `Argumentos no válidos en la herramienta ${call.function.name}`,
          );
          result = 'Error: los argumentos no son un JSON válido. Reinténtalo.';
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    return { text: replyText, actions, usage };
  }

  private async complete(
    messages: OpenAiMessage[],
    usage: TokenUsage,
  ): Promise<{ content?: string | null; tool_calls?: OpenAiToolCall[] }> {
    // Sin límite, un modelo que arranca en frío puede dejar colgado al worker de
    // WhatsApp indefinidamente. El temporizador se cancela siempre al terminar
    // (con `AbortSignal.timeout` quedaba vivo hasta agotarse).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NVIDIA_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages,
          tools: this.tools,
          tool_choice: 'auto',
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `NVIDIA no respondió en ${NVIDIA_REQUEST_TIMEOUT_MS / 1000}s (modelo ${this.model})`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `NVIDIA respondió ${response.status} generando la respuesta: ${detail.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as OpenAiChatCompletion;
    // Se apunta antes de validar el mensaje: la llamada ya se hizo y ya se paga,
    // aunque la respuesta venga mal formada.
    usage.calls += 1;
    usage.inputTokens += data.usage?.prompt_tokens ?? 0;
    usage.outputTokens += data.usage?.completion_tokens ?? 0;

    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new Error('NVIDIA devolvió una respuesta sin mensaje');
    }
    return message;
  }
}
