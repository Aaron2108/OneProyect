import { BadRequestException } from '@nestjs/common';
import { KnowledgeExtractionMethod } from '@prisma/client';
import { KnowledgeExtractorService } from '../../src/knowledge/knowledge-extractor.service';
import { MAX_FILE_BYTES } from '../../src/knowledge/knowledge.constants';

/**
 * Construye un PDF mínimo válido. `withText` controla si la página lleva
 * operadores de texto: sin ellos, simula un escaneo (páginas como imagen).
 */
function makePdf(withText: boolean, body = 'Contenido del documento'): Buffer {
  const stream = `BT /F1 12 Tf 50 700 Td (${body}) Tj ET`;
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    withText
      ? '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
      : '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ];
  if (withText) {
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  }

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

describe('KnowledgeExtractorService', () => {
  const service = new KnowledgeExtractorService();

  describe('detectFormat (el tipo se decide por el contenido, no por la extensión)', () => {
    it('reconoce un PDF por su cabecera', () => {
      expect(service.detectFormat(makePdf(true), 'algo.pdf')).toBe('pdf');
    });

    it('reconoce texto plano y Markdown', () => {
      const text = Buffer.from('# Políticas\n\nAtendemos de 9 a 18.', 'utf8');
      expect(service.detectFormat(text, 'politicas.md')).toBe('text');
    });

    it('rechaza un binario disfrazado de PDF por la extensión', () => {
      // Cabecera PNG con nombre .pdf: es el caso que un atacante intentaría.
      const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(200, 7),
      ]);
      expect(() => service.detectFormat(png, 'malicioso.pdf')).toThrow(BadRequestException);
    });

    it('rechaza un ZIP que no es .docx', () => {
      const zip = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(100, 0x41)]);
      expect(() => service.detectFormat(zip, 'planilla.xlsx')).toThrow(BadRequestException);
    });

    it('rechaza un archivo vacío', () => {
      expect(() => service.detectFormat(Buffer.alloc(0), 'vacio.txt')).toThrow(BadRequestException);
    });

    it('rechaza un archivo que excede el tamaño máximo', () => {
      const big = Buffer.alloc(MAX_FILE_BYTES + 1, 0x41);
      expect(() => service.detectFormat(big, 'grande.txt')).toThrow(BadRequestException);
    });
  });

  describe('extract', () => {
    it('extrae el texto de un archivo de texto', async () => {
      const content = 'Atendemos de lunes a viernes de 9 a 18. Cancelaciones con 24h.';
      const result = await service.extract(Buffer.from(content, 'utf8'), 'text');
      expect(result.text).toContain('lunes a viernes');
      expect(result.method).toBe(KnowledgeExtractionMethod.TEXT_LAYER);
      expect(result.needsVision).toBe(false);
    });

    it('rechaza un texto sin contenido útil', async () => {
      await expect(service.extract(Buffer.from('hola', 'utf8'), 'text')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('usa la capa de texto de un PDF cuando existe', async () => {
      const pdf = makePdf(true, 'Horario de atencion de lunes a viernes de nueve a dieciocho');
      const result = await service.extract(pdf, 'pdf');
      expect(result.method).toBe(KnowledgeExtractionMethod.TEXT_LAYER);
      expect(result.needsVision).toBe(false);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.pageCount).toBe(1);
    });

    it('no mete el marcador de página de pdf-parse en el texto del negocio', async () => {
      const result = await service.extract(makePdf(true, 'Politica de cancelacion vigente'), 'pdf');
      expect(result.text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
    });

    it('marca needsVision en un PDF sin capa de texto (escaneo)', async () => {
      const result = await service.extract(makePdf(false), 'pdf');
      expect(result.needsVision).toBe(true);
      expect(result.method).toBe(KnowledgeExtractionMethod.VISION);
      // No devuelve basura: el texto viene vacío para que el llamador transcriba.
      expect(result.text).toBe('');
    });

    it('un PDF corto pero con texto real NO va a visión (no gasta créditos de más)', async () => {
      // El umbral se mide por página justamente para no confundir "documento
      // corto" con "escaneo": una lista de precios de una página es legítima y
      // no debería costar una transcripción con visión.
      const listaDePrecios =
        'Corte de cabello 3000. Coloracion completa 8000. Keratina 15000. Peinado 5000.';
      const result = await service.extract(makePdf(true, listaDePrecios), 'pdf');
      expect(result.needsVision).toBe(false);
      expect(result.method).toBe(KnowledgeExtractionMethod.TEXT_LAYER);
    });

    it('una página con apenas unos caracteres sí se trata como escaneo', async () => {
      // Debajo de MIN_CHARS_PER_PAGE: una página entera con un puñado de
      // caracteres es casi siempre un escaneo con algún artefacto de texto, no
      // un documento real — conviene transcribirla.
      const result = await service.extract(makePdf(true, 'pag 1'), 'pdf');
      expect(result.needsVision).toBe(true);
    });

    it('rechaza un PDF dañado con un mensaje entendible', async () => {
      const roto = Buffer.from('%PDF-1.4\nesto no es un pdf valido\n', 'latin1');
      await expect(service.extract(roto, 'pdf')).rejects.toThrow(BadRequestException);
    });
  });
});
