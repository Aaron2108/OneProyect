import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Dimensión del vector de embedding, fija por las columnas `vector(1024)` de
 * `ai_context_memory` y `knowledge_chunks`. Cambiar de modelo a otra dimensión
 * exige una migración de ambas columnas, no solo cambiar esta constante.
 *
 * Se eligió 1024 porque sirve a los dos proveedores previstos sin volver a
 * migrar: es la dimensión nativa de `nv-embedqa-e5-v5` (NVIDIA, el que se usa
 * mientras se prueba) y la de `voyage-3` (el destino con créditos de Anthropic).
 */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Qué se está vectorizando. Los modelos de recuperación son **asimétricos**:
 * codifican distinto una pregunta que el texto donde se busca la respuesta, y
 * usar el tipo equivocado degrada el ranking. No es un detalle opcional.
 */
export type EmbeddingKind = 'query' | 'passage';

/**
 * Genera embeddings de texto para la memoria de contexto y para la búsqueda en
 * la documentación del negocio.
 *
 * Anthropic no ofrece una API de embeddings propia. Hay tres proveedores:
 * - `voyage`: destino de producción (Anthropic lo recomienda en su documentación).
 * - `nvidia`: real y gratuito, para tener búsqueda semántica de verdad mientras
 *   no hay créditos de Voyage.
 * - `mock`: determinístico y sin red, para tests. **No busca por significado**:
 *   ordena por frecuencia de caracteres, así que sirve para probar la tubería,
 *   nunca para evaluar la calidad de la recuperación.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('embeddings.provider') ?? 'mock';
    this.apiKey = this.config.get<string>('embeddings.apiKey') ?? '';
    this.model = this.config.get<string>('embeddings.model') ?? '';
    this.baseUrl = this.config.get<string>('embeddings.baseUrl') ?? '';
  }

  /** La búsqueda opera si es modo mock, o si hay API key configurada. */
  isEnabled(): boolean {
    return this.provider === 'mock' || !!this.apiKey;
  }

  /**
   * `kind` distingue la consulta del texto indexado. Es obligatorio a propósito:
   * con un valor por defecto sería fácil indexar como si fuera una pregunta y
   * empeorar la búsqueda sin que nadie lo note.
   */
  async embed(text: string, kind: EmbeddingKind): Promise<number[]> {
    if (this.provider === 'mock') {
      return this.mockEmbed(text);
    }
    if (this.provider === 'nvidia') {
      return this.nvidiaEmbed(text, kind);
    }
    return this.voyageEmbed(text, kind);
  }

  private async voyageEmbed(text: string, kind: EmbeddingKind): Promise<number[]> {
    const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        model: this.model || 'voyage-3',
        // Voyage llama `document` a lo que aquí es `passage`.
        input_type: kind === 'query' ? 'query' : 'document',
      }),
    });
    if (!response.ok) {
      throw new Error(`Voyage AI respondió ${response.status} generando el embedding`);
    }
    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return this.validate(data.data[0]?.embedding, 'Voyage AI');
  }

  private async nvidiaEmbed(text: string, kind: EmbeddingKind): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [text],
        model: this.model || 'nvidia/nv-embedqa-e5-v5',
        input_type: kind,
        encoding_format: 'float',
        // Un fragmento más largo que la ventana del modelo sería un error 400;
        // recortar el final es preferible a perder el fragmento entero.
        truncate: 'END',
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `NVIDIA respondió ${response.status} generando el embedding: ${detail.slice(0, 200)}`,
      );
    }
    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return this.validate(data.data[0]?.embedding, 'NVIDIA');
  }

  /**
   * Un vector de dimensión distinta a la de las columnas rompería el `::vector`
   * en la BD con un error opaco; se corta antes y con un mensaje que dice qué
   * pasó.
   */
  private validate(embedding: number[] | undefined, proveedor: string): number[] {
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `${proveedor} devolvió un embedding de dimensión ${embedding?.length ?? 0}; ` +
          `las columnas son vector(${EMBEDDING_DIMENSIONS}). Revisa EMBEDDINGS_MODEL.`,
      );
    }
    return embedding;
  }

  /**
   * Embedding determinístico (sin llamar a ninguna API) para tests: el mismo
   * texto siempre produce el mismo vector.
   *
   * NO representa significado —suma códigos de carácter—, así que dos textos
   * cualesquiera quedan a distancia parecida. Sirve para verificar que guardar y
   * recuperar funciona, no para juzgar si se recupera lo correcto.
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
