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

/**
 * Estos modelos a veces ESCRIBEN la llamada a la herramienta en vez de emitirla
 * por la API, en la forma `<TOOLCALL>[{"name": …, "arguments": {…}}]`.
 *
 * Visto en producción y con consecuencias serias: el agente escribió el
 * `create_appointment` como texto, así que no se ejecutó nada, el cliente vio el
 * JSON en crudo en su WhatsApp y —peor— el modelo siguió como si la cita
 * existiera y le confirmó una hora que no estaba agendada en ninguna parte.
 *
 * Se rescatan esas llamadas para ejecutarlas de verdad, y en todo caso el texto
 * se retira del mensaje: aunque no se pueda interpretar, un cliente no puede
 * leer las tripas del sistema.
 */
export function extraerLlamadasEnTexto(texto: string): {
  /** Llamadas recuperadas, ya en el formato que usa el bucle. */
  llamadas: OpenAiToolCall[];
  /** El mensaje sin el bloque de la llamada. */
  limpio: string;
  /** true si había un intento de llamada, se pudiera interpretar o no. */
  huboIntento: boolean;
} {
  // El cierre es opcional a propósito: cuando la respuesta se corta por el
  // límite de tokens, la etiqueta final no llega — y ese caso es justo el que
  // no puede acabar enseñándole el JSON al cliente.
  const bloque = /<TOOLCALL>([\s\S]*?)(?:<\/TOOLCALL>|$)/i;
  const encontrado = bloque.exec(texto);
  if (!encontrado) return { llamadas: [], limpio: texto, huboIntento: false };

  const limpio = texto.replace(bloque, '').trim();
  const llamadas: OpenAiToolCall[] = [];

  try {
    const parsed: unknown = JSON.parse((encontrado[1] ?? '').trim());
    const lista = Array.isArray(parsed) ? parsed : [parsed];
    lista.forEach((item, i) => {
      if (!item || typeof item !== 'object') return;
      const { name, arguments: args } = item as { name?: unknown; arguments?: unknown };
      if (typeof name !== 'string' || !name) return;
      llamadas.push({
        // Id sintético: el proveedor solo lo usa para casar la respuesta de la
        // herramienta con su llamada, y aquí las emparejamos nosotros.
        id: `texto-${i}`,
        type: 'function',
        function: {
          name,
          // El bucle espera los argumentos como texto JSON, igual que la API.
          arguments: JSON.stringify(args ?? {}),
        },
      });
    });
  } catch {
    // JSON cortado o mal formado. NO se intenta adivinar lo que faltaba: aquí se
    // agendan citas, y completar a ojo una fecha truncada agendaría a una hora
    // que el cliente nunca pidió. Se devuelve el intento sin llamadas para que
    // quien llama obligue al modelo a repetirla bien.
  }

  return { llamadas, limpio, huboIntento: true };
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
      const crudo = message.content ?? '';

      // Rescate de las llamadas que el modelo escribe como texto en vez de
      // emitirlas por la API. `limpio` es el mensaje ya sin ese bloque: pase lo
      // que pase con la llamada, eso no puede llegarle al cliente.
      const enTexto = extraerLlamadasEnTexto(crudo);
      replyText = stripReasoning(enTexto.limpio);

      const porApi = message.tool_calls ?? [];
      const toolCalls = porApi.length > 0 ? porApi : enTexto.llamadas;

      if (toolCalls.length === 0) {
        // Había un intento de llamada que no se pudo interpretar (JSON cortado,
        // normalmente). Cortar aquí es lo que provocó el incidente: el modelo
        // se quedaba con "ya llamé a la herramienta" y le confirmaba al cliente
        // una cita que no existía. Se le devuelve el error y se le obliga a
        // repetirla bien.
        if (enTexto.huboIntento) {
          this.logger.warn('El modelo escribió la llamada como texto y no se pudo interpretar');
          messages.push({ role: 'assistant', content: crudo });
          messages.push({
            role: 'user',
            content:
              'Esa llamada a la herramienta no se ejecutó: llegó como texto y estaba incompleta. NO le digas al cliente que ya está hecho. Vuelve a intentarlo usando el mecanismo de herramientas.',
          });
          continue;
        }
        break; // respuesta final
      }

      // El turno del asistente debe conservar los tool_calls: el proveedor
      // rechaza un mensaje `tool` que no responda a una llamada previa.
      messages.push({
        // El contenido va limpio: si la llamada venía escrita en el texto, no
        // se reenvía al modelo su propio JSON para que no lo repita.
        role: 'assistant',
        content: enTexto.limpio,
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
