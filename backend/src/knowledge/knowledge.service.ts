import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KnowledgeDocumentStatus, KnowledgeExtractionMethod } from '@prisma/client';
import { EMBEDDING_DIMENSIONS, EmbeddingsService } from '../ai/embeddings.service';
import { PiiCryptoService } from '../common/pii-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { chunkText } from './knowledge-chunker.util';
import { KnowledgeExtractorService } from './knowledge-extractor.service';
import { KnowledgeVisionService } from './knowledge-vision.service';

/** Cuántos caracteres del texto extraído se devuelven en la vista previa. */
const PREVIEW_CHARS = 4000;

export interface KnowledgeDocumentDto {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KnowledgeDocumentStatus;
  extractionMethod: KnowledgeExtractionMethod | null;
  pageCount: number | null;
  charCount: number | null;
  visionTokensUsed: number;
  extractionError: string | null;
  createdAt: string;
}

export interface KnowledgeUploadResult extends KnowledgeDocumentDto {
  /** Texto extraído (recortado) para que el dueño lo revise antes de activarlo. */
  preview: string;
  /** true si `preview` está recortado respecto al texto completo. */
  previewTruncated: boolean;
}

/**
 * Documentos del negocio que alimentan a la IA.
 *
 * Flujo deliberado en dos pasos: al subir, el documento queda en
 * `PENDING_REVIEW` con su texto extraído a la vista, y **solo se fragmenta y
 * queda disponible para la IA cuando el dueño lo confirma** (`activate`). Sin
 * esa confirmación, "validado" sería una promesa vacía: el dueño no tendría
 * forma de ver qué entendió el sistema de su PDF antes de que la IA empiece a
 * responderle a sus clientes con eso.
 *
 * Mientras está pendiente de revisión, el texto se guarda cifrado en un único
 * fragmento en posición -1, que no participa de la recuperación (filtra por
 * status ACTIVE). Al activar se reemplaza por los fragmentos definitivos.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: KnowledgeExtractorService,
    private readonly vision: KnowledgeVisionService,
    private readonly embeddings: EmbeddingsService,
    private readonly pii: PiiCryptoService,
  ) {}

  /** Documentos del tenant, más recientes primero. */
  async list(tenantId: string): Promise<KnowledgeDocumentDto[]> {
    const docs = await this.prisma.knowledgeDocument.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((doc) => this.toDto(doc));
  }

  /**
   * Sube un documento: valida, extrae el texto (con visión si es un escaneo) y
   * lo deja en PENDING_REVIEW junto a una vista previa. No lo activa.
   */
  async upload(
    tenantId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ): Promise<KnowledgeUploadResult> {
    const format = this.extractor.detectFormat(file.buffer, file.originalname);
    const extraction = await this.extractor.extract(file.buffer, format);

    let text = extraction.text;
    let method = extraction.method;
    let visionTokensUsed = 0;

    if (extraction.needsVision) {
      if (!this.vision.isEnabled()) {
        throw new BadRequestException(
          'Este PDF es un escaneo (no tiene texto seleccionable) y la transcripción ' +
            'automática no está disponible. Subilo en formato de texto, Word, o como un ' +
            'PDF con texto real.',
        );
      }
      try {
        const transcription = await this.vision.transcribePdf(
          file.buffer,
          file.originalname,
        );
        text = transcription.text;
        visionTokensUsed = transcription.tokensUsed;
        method = KnowledgeExtractionMethod.VISION;
      } catch (err) {
        // Se registra el fallo en vez de guardar un documento vacío: así el
        // dueño ve qué pasó y puede subirlo de otra forma.
        const reason = (err as Error).message;
        const failed = await this.prisma.knowledgeDocument.create({
          data: {
            tenantId,
            filename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.buffer.length,
            status: KnowledgeDocumentStatus.FAILED,
            extractionMethod: KnowledgeExtractionMethod.VISION,
            pageCount: extraction.pageCount,
            extractionError: reason,
          },
        });
        this.logger.warn(`Documento "${file.originalname}" falló al transcribir: ${reason}`);
        return { ...this.toDto(failed), preview: '', previewTruncated: false };
      }
    }

    const document = await this.prisma.knowledgeDocument.create({
      data: {
        tenantId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
        status: KnowledgeDocumentStatus.PENDING_REVIEW,
        extractionMethod: method,
        pageCount: extraction.pageCount,
        charCount: text.length,
        visionTokensUsed,
      },
    });

    // Texto completo cifrado en posición -1 mientras espera revisión. No lo
    // recupera nadie (el recall filtra por status ACTIVE) y evita tener que
    // volver a pedirle el archivo al dueño para activarlo.
    await this.storePendingText(tenantId, document.id, text);

    return {
      ...this.toDto(document),
      preview: text.slice(0, PREVIEW_CHARS),
      previewTruncated: text.length > PREVIEW_CHARS,
    };
  }

  /** Vista previa del texto de un documento (para revisarlo antes de activarlo). */
  async preview(
    tenantId: string,
    documentId: string,
  ): Promise<{ preview: string; previewTruncated: boolean }> {
    await this.requireDocument(tenantId, documentId);
    const text = await this.loadText(documentId);
    return {
      preview: text.slice(0, PREVIEW_CHARS),
      previewTruncated: text.length > PREVIEW_CHARS,
    };
  }

  /**
   * Confirma un documento: fragmenta su texto, genera los embeddings y lo pasa a
   * ACTIVE. Desde este momento la IA puede usarlo para responder.
   */
  async activate(tenantId: string, documentId: string): Promise<KnowledgeDocumentDto> {
    const document = await this.requireDocument(tenantId, documentId);
    if (document.status === KnowledgeDocumentStatus.FAILED) {
      throw new BadRequestException(
        'Este documento no se pudo leer, así que no puede activarse.',
      );
    }
    if (!this.embeddings.isEnabled()) {
      throw new BadRequestException(
        'La búsqueda por similitud no está configurada, así que la IA no podría ' +
          'consultar este documento. Revisá EMBEDDINGS_PROVIDER.',
      );
    }

    const text = await this.loadText(documentId);
    const pieces = chunkText(text);
    if (pieces.length === 0) {
      throw new BadRequestException('El documento no tiene texto que indexar.');
    }

    // Se reemplazan los fragmentos existentes (el pendiente de revisión, o los
    // de una activación anterior) para que reactivar sea idempotente.
    await this.prisma.knowledgeChunk.deleteMany({ where: { documentId } });

    for (const [position, piece] of pieces.entries()) {
      const embedding = await this.embeddings.embed(piece);
      await this.insertChunk(tenantId, documentId, position, piece, embedding);
    }

    const updated = await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: KnowledgeDocumentStatus.ACTIVE, charCount: text.length },
    });
    this.logger.log(
      `Documento "${updated.filename}" activado con ${pieces.length} fragmentos.`,
    );
    return this.toDto(updated);
  }

  /** Borra un documento y sus fragmentos (cascade en la BD). */
  async remove(tenantId: string, documentId: string): Promise<void> {
    await this.requireDocument(tenantId, documentId);
    await this.prisma.knowledgeDocument.delete({ where: { id: documentId } });
  }

  /** Documentos activos con su peso, para el panel de contexto. */
  async activeSummary(
    tenantId: string,
  ): Promise<Array<{ filename: string; charCount: number }>> {
    const docs = await this.prisma.knowledgeDocument.findMany({
      where: { tenantId, status: KnowledgeDocumentStatus.ACTIVE },
      select: { filename: true, charCount: true },
      orderBy: { createdAt: 'asc' },
    });
    return docs.map((doc) => ({ filename: doc.filename, charCount: doc.charCount ?? 0 }));
  }

  private async requireDocument(tenantId: string, documentId: string) {
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    return document;
  }

  /** Reconstruye el texto de un documento a partir de sus fragmentos, en orden. */
  private async loadText(documentId: string): Promise<string> {
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { content: true, position: true },
    });
    if (chunks.length === 0) return '';
    // Posición -1 = texto completo pendiente de revisión (ver storePendingText).
    if (chunks.length === 1 && chunks[0].position === -1) {
      return this.pii.decrypt(chunks[0].content);
    }
    // Ya fragmentado: los fragmentos se solapan, así que unirlos tal cual
    // duplicaría texto. Para revisar alcanza con verlos en orden separados.
    return chunks.map((chunk) => this.pii.decrypt(chunk.content)).join('\n\n');
  }

  /**
   * Guarda el texto completo sin indexar (posición -1) mientras el documento
   * espera revisión. Necesita un embedding porque la columna es NOT NULL: se usa
   * un vector nulo, que nunca se consulta porque el recall filtra por ACTIVE.
   */
  private async storePendingText(
    tenantId: string,
    documentId: string,
    text: string,
  ): Promise<void> {
    const zeroVector = new Array(EMBEDDING_DIMENSIONS).fill(0);
    await this.insertChunk(tenantId, documentId, -1, text, zeroVector);
  }

  private async insertChunk(
    tenantId: string,
    documentId: string,
    position: number,
    content: string,
    embedding: number[],
  ): Promise<void> {
    const id = randomUUID();
    const encrypted = this.pii.encrypt(content);
    await this.prisma.$executeRaw`
      INSERT INTO knowledge_chunks (id, tenant_id, document_id, position, content, embedding)
      VALUES (${id}, ${tenantId}, ${documentId}, ${position}, ${encrypted}, ${toVectorLiteral(embedding)}::vector)
    `;
  }

  private toDto(doc: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    status: KnowledgeDocumentStatus;
    extractionMethod: KnowledgeExtractionMethod | null;
    pageCount: number | null;
    charCount: number | null;
    visionTokensUsed: number;
    extractionError: string | null;
    createdAt: Date;
  }): KnowledgeDocumentDto {
    return {
      id: doc.id,
      filename: doc.filename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      status: doc.status,
      extractionMethod: doc.extractionMethod,
      pageCount: doc.pageCount,
      charCount: doc.charCount,
      visionTokensUsed: doc.visionTokensUsed,
      extractionError: doc.extractionError,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}

/** pgvector acepta la representación de texto `[v1,v2,...]` casteada con `::vector`. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
