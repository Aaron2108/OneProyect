import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Dimensión del vector de embedding. Fija porque la columna `ai_context_memory.embedding`
 * se creó como `vector(512)` (ver migración `ai_context_memory`) — coincide con la
 * dimensión nativa de `voyage-3-lite`. Cambiar de modelo/proveedor con otra dimensión
 * exige una migración nueva de la columna, no solo cambiar esta constante.
 */
export const EMBEDDING_DIMENSIONS = 512;

/**
 * Genera embeddings de texto para la memoria de contexto de la IA (Fase 4).
 * Anthropic no ofrece una API de embeddings propia; se usa Voyage AI (el
 * proveedor con el que Anthropic tiene acuerdo/lo recomienda en su
 * documentación) — mismo patrón `mock`/proveedor real que `AiService`, para
 * poder construir y probar toda la tubería (guardar/recuperar memoria) sin
 * gastar créditos hasta tener la API key real.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('embeddings.provider') ?? 'mock';
    this.apiKey = this.config.get<string>('embeddings.apiKey') ?? '';
    this.model = this.config.get<string>('embeddings.model') ?? 'voyage-3-lite';
  }

  /** La memoria de contexto opera si es modo mock, o si hay API key configurada. */
  isEnabled(): boolean {
    return this.provider === 'mock' || !!this.apiKey;
  }

  async embed(text: string): Promise<number[]> {
    if (this.provider === 'mock') {
      return this.mockEmbed(text);
    }
    return this.voyageEmbed(text);
  }

  private async voyageEmbed(text: string): Promise<number[]> {
    const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text, model: this.model }),
    });
    if (!response.ok) {
      throw new Error(`Voyage AI respondió ${response.status} generando el embedding`);
    }
    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    const embedding = data.data[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Voyage AI devolvió un embedding de dimensión inesperada (esperado ${EMBEDDING_DIMENSIONS})`,
      );
    }
    return embedding;
  }

  /**
   * Embedding determinístico (sin llamar a ninguna API) para pruebas locales:
   * el mismo texto siempre produce el mismo vector, y textos similares (mismos
   * caracteres) quedan cerca — suficiente para probar la tubería de guardar y
   * recuperar memoria sin gastar créditos.
   */
  private mockEmbed(text: string): number[] {
    const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
    for (let i = 0; i < text.length; i++) {
      vector[i % EMBEDDING_DIMENSIONS] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }
}
