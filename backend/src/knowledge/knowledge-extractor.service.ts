import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { KnowledgeExtractionMethod } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import {
  MAX_FILE_BYTES,
  MAX_PDF_PAGES,
  MIN_CHARS_PER_PAGE,
  MIN_USEFUL_CHARS,
} from './knowledge.constants';

/** Formato reconocido a partir del contenido real del archivo. */
export type DetectedFormat = 'pdf' | 'docx' | 'text';

export interface ExtractionResult {
  text: string;
  pageCount: number | null;
  method: KnowledgeExtractionMethod;
  /**
   * true cuando el archivo es un PDF sin capa de texto (un escaneo): no hay
   * nada que extraer de forma nativa y hay que transcribirlo con visión.
   * `text` viene vacío en ese caso.
   */
  needsVision: boolean;
}

/**
 * Extrae el texto de los documentos que el negocio sube para la IA.
 *
 * Dos principios:
 *
 * 1. **El tipo se decide por el contenido, no por la extensión ni por el
 *    `Content-Type` del navegador** — ambos los controla el cliente y se pueden
 *    falsear. Se validan los magic bytes del archivo.
 * 2. **Un PDF escaneado no se guarda como basura.** Si no hay capa de texto,
 *    se marca `needsVision` para que el llamador decida transcribirlo con la
 *    visión de Claude (que sí cuesta tokens), en vez de persistir un fragmento
 *    vacío que después contaminaría las respuestas.
 */
@Injectable()
export class KnowledgeExtractorService {
  private readonly logger = new Logger(KnowledgeExtractorService.name);

  /**
   * Reconoce el formato real por sus magic bytes. Lanza si el archivo no es de
   * un tipo aceptado o si excede el tamaño máximo.
   */
  detectFormat(buffer: Buffer, filename: string): DetectedFormat {
    if (buffer.length === 0) {
      throw new BadRequestException('El archivo está vacío.');
    }
    if (buffer.length > MAX_FILE_BYTES) {
      const mb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
      throw new BadRequestException(`El archivo supera el máximo de ${mb} MB.`);
    }

    // PDF: cabecera "%PDF-"
    if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
      return 'pdf';
    }

    // DOCX es un ZIP ("PK\x03\x04"); que además sea un Word válido lo verifica
    // mammoth al abrirlo. Se rechazan aquí otros ZIP (p. ej. .xlsx, .zip).
    if (buffer.subarray(0, 4).toString('latin1') === 'PK\x03\x04') {
      if (!/\.docx$/i.test(filename)) {
        throw new BadRequestException(
          'Ese archivo comprimido no es un documento de Word (.docx).',
        );
      }
      return 'docx';
    }

    // Texto plano / Markdown: no tienen magic bytes, así que se comprueba que
    // el contenido sea texto de verdad (UTF-8 sin bytes nulos ni de control).
    if (this.looksLikeText(buffer)) {
      return 'text';
    }

    throw new BadRequestException(
      'Formato no admitido. Se aceptan PDF, Word (.docx), texto plano y Markdown.',
    );
  }

  /** Extrae el texto según el formato detectado. */
  async extract(buffer: Buffer, format: DetectedFormat): Promise<ExtractionResult> {
    switch (format) {
      case 'pdf':
        return this.extractPdf(buffer);
      case 'docx':
        return this.extractDocx(buffer);
      case 'text': {
        const text = this.normalize(buffer.toString('utf8'));
        if (text.length < MIN_USEFUL_CHARS) {
          throw new BadRequestException('El archivo no tiene texto suficiente para ser útil.');
        }
        return {
          text,
          pageCount: null,
          method: KnowledgeExtractionMethod.TEXT_LAYER,
          needsVision: false,
        };
      }
    }
  }

  private async extractPdf(buffer: Buffer): Promise<ExtractionResult> {
    const parser = new PDFParse({ data: buffer });
    try {
      // pageJoiner vacío: por defecto pdf-parse intercala un marcador
      // "-- 1 of 3 --" en cada página, y eso terminaría dentro del contexto que
      // recibe la IA como si fuera contenido del negocio.
      const result = await parser.getText({ pageJoiner: '' });
      const pageCount = result.total;

      if (pageCount > MAX_PDF_PAGES) {
        throw new BadRequestException(
          `El PDF tiene ${pageCount} páginas y el máximo es ${MAX_PDF_PAGES}. ` +
            'Divídelo en documentos más chicos.',
        );
      }

      const text = this.normalize(result.text);
      // Sin capa de texto = PDF escaneado (páginas como imagen). No se guarda
      // basura: se deja que el llamador lo transcriba con visión.
      //
      // El umbral es POR PÁGINA: un documento corto pero con texto real (una
      // lista de precios de una página) no debe acabar en visión gastando
      // créditos, y un escaneo de 40 páginas no debe pasar por texto solo
      // porque acumuló algo de ruido.
      const charsPerPage = text.length / Math.max(pageCount, 1);
      if (charsPerPage < MIN_CHARS_PER_PAGE) {
        return {
          text: '',
          pageCount,
          method: KnowledgeExtractionMethod.VISION,
          needsVision: true,
        };
      }

      return {
        text,
        pageCount,
        method: KnowledgeExtractionMethod.TEXT_LAYER,
        needsVision: false,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const message = (err as Error).message;
      this.logger.warn(`No se pudo leer el PDF: ${message}`);
      throw new BadRequestException(
        'No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.',
      );
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private async extractDocx(buffer: Buffer): Promise<ExtractionResult> {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      const text = this.normalize(value);
      if (text.length < MIN_USEFUL_CHARS) {
        throw new BadRequestException(
          'El documento de Word no tiene texto suficiente para ser útil.',
        );
      }
      return {
        text,
        pageCount: null,
        method: KnowledgeExtractionMethod.TEXT_LAYER,
        needsVision: false,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`No se pudo leer el .docx: ${(err as Error).message}`);
      throw new BadRequestException('No se pudo leer el documento de Word.');
    }
  }

  /**
   * Heurística de "esto es texto": UTF-8 decodificable, sin bytes nulos y con
   * una proporción muy baja de caracteres de control. Se inspecciona solo el
   * principio: alcanza para descartar binarios sin recorrer archivos grandes.
   */
  private looksLikeText(buffer: Buffer): boolean {
    const sample = buffer.subarray(0, 4096);
    if (sample.includes(0)) return false;

    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(sample);
    // U+FFFD es el reemplazo que inserta el decodificador ante bytes inválidos.
    if (decoded.includes('�')) return false;

    let control = 0;
    for (const ch of decoded) {
      const code = ch.codePointAt(0) ?? 0;
      const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
      if (code < 32 && !isAllowedWhitespace) control++;
    }
    return control / Math.max(decoded.length, 1) < 0.01;
  }

  /** Colapsa espacios y saltos de línea excesivos, y recorta los extremos. */
  private normalize(raw: string): string {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
