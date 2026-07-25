import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAX_FILE_BYTES } from './knowledge.constants';

/** Tokens máximos de salida al transcribir un PDF escaneado. */
const MAX_TRANSCRIPTION_TOKENS = 8192;

const TRANSCRIPTION_PROMPT =
  'Transcribe literalmente todo el texto de este documento, respetando su orden y ' +
  'estructura (títulos, listas, tablas como texto). No resumas, no interpretes y no ' +
  'agregues comentarios propios: devuelve solo el contenido del documento. Si una ' +
  'parte es ilegible, escribe [ilegible] en su lugar.';

export interface VisionTranscription {
  text: string;
  /** Tokens consumidos por la transcripción (costo de una sola vez, al subir). */
  tokensUsed: number;
}

/**
 * Transcribe PDFs escaneados (páginas como imagen, sin capa de texto) usando la
 * lectura nativa de PDF de Claude, que procesa cada página también como imagen.
 *
 * Por qué así y no con un motor de OCR: Tesseract exigiría además renderizar
 * PDF→imagen, lo que en Windows arrastra dependencias nativas (GraphicsMagick /
 * Ghostscript) y da una calidad muy variable. El SDK de Anthropic ya está en el
 * proyecto y acepta el PDF directo.
 *
 * **Este servicio sí gasta créditos**, a diferencia del resto de la extracción.
 * Solo se invoca cuando la extracción nativa no devolvió texto, y es un costo de
 * una sola vez al subir el documento — no por cada mensaje de WhatsApp, porque
 * lo que se guarda es el texto transcrito.
 *
 * Tiene su propio cliente de Anthropic (mismo patrón que `AiService` y
 * `EmbeddingsService`, que leen la configuración por su cuenta) para que
 * `KnowledgeModule` no tenga que importar `AiModule` — `AiModule` ya depende del
 * conocimiento para el recall, así que importarlo de vuelta sería circular.
 */
@Injectable()
export class KnowledgeVisionService {
  private readonly logger = new Logger(KnowledgeVisionService.name);
  private readonly client: Anthropic | null;
  private readonly provider: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ai.apiKey') ?? '';
    this.provider = this.config.get<string>('ai.provider') ?? 'anthropic';
    this.model = this.config.get<string>('ai.model') ?? 'claude-haiku-4-5';
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  /** Puede transcribir si es modo mock, o si hay API key configurada. */
  isEnabled(): boolean {
    return this.provider === 'mock' || this.client !== null;
  }

  /**
   * Transcribe el contenido de un PDF escaneado. Lanza si la transcripción no
   * es posible o no devuelve texto: el llamador marca el documento como FAILED
   * en vez de guardar un fragmento vacío.
   */
  async transcribePdf(buffer: Buffer, filename: string): Promise<VisionTranscription> {
    if (buffer.length > MAX_FILE_BYTES) {
      throw new Error('El PDF es demasiado grande para transcribirlo.');
    }
    if (this.provider === 'mock') {
      return this.mockTranscribe(filename);
    }
    if (!this.client) {
      throw new Error(
        'No se puede transcribir un PDF escaneado sin ANTHROPIC_API_KEY configurada.',
      );
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TRANSCRIPTION_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                // Sin saltos de línea: la API rechaza el base64 con formato.
                data: buffer.toString('base64'),
              },
            },
            { type: 'text', text: TRANSCRIPTION_PROMPT },
          ],
        },
      ],
    });

    // Una negativa del modelo (`refusal`) llega con HTTP 200 y `content` vacío:
    // hay que comprobar `stop_reason` antes de leer el contenido.
    if (response.stop_reason === 'refusal') {
      throw new Error('El modelo no pudo procesar el contenido de este documento.');
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

    if (!text) {
      throw new Error('No se pudo leer texto de este PDF escaneado.');
    }

    this.logger.log(
      `PDF escaneado "${filename}" transcrito con visión (${tokensUsed} tokens).`,
    );
    return { text, tokensUsed };
  }

  /**
   * Transcripción simulada para desarrollo local sin gastar créditos (mismo
   * patrón que `AI_PROVIDER=mock` en el resto del proyecto). Permite probar toda
   * la tubería —subida, revisión, fragmentado, recuperación— de punta a punta.
   */
  private mockTranscribe(filename: string): VisionTranscription {
    return {
      text:
        `[Transcripción simulada de "${filename}"]\n\n` +
        'Horario de atención: lunes a viernes de 9:00 a 18:00.\n' +
        'Política de cancelación: avisar con 24 horas de anticipación.\n' +
        'Formas de pago: efectivo, transferencia y tarjeta de crédito.\n\n' +
        'Este texto es de prueba porque AI_PROVIDER=mock: con una API key real, ' +
        'aquí aparecería el contenido verdadero del documento escaneado.',
      tokensUsed: 0,
    };
  }
}
