import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import {
  KnowledgeDocumentDto,
  KnowledgeService,
  KnowledgeUploadResult,
} from './knowledge.service';
import { MAX_FILE_BYTES } from './knowledge.constants';

/** Forma mínima del archivo que entrega multer, sin depender de tipos globales de Express. */
interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Documentos de conocimiento del negocio (apartado "Agente IA" del panel).
 *
 * Los cambios son solo del OWNER: activar un documento cambia lo que la IA les
 * responde a los clientes del negocio, así que no es una acción de agente.
 */
@Controller('knowledge/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  /** Cualquier miembro puede ver qué documentación tiene cargada el agente. */
  @Get()
  list(@CurrentUser() user: AuthContext): Promise<KnowledgeDocumentDto[]> {
    return this.knowledge.list(user.tenantId);
  }

  /**
   * Sube un documento y devuelve el texto extraído para revisión. El documento
   * queda PENDING_REVIEW: la IA todavía no lo usa (ver KnowledgeService).
   *
   * El límite de tamaño se aplica en el interceptor (antes de cargar el archivo
   * completo en memoria) y se vuelve a validar en el extractor sobre el buffer
   * real, que es la única fuente confiable.
   */
  @Post()
  @Roles(UserRole.OWNER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  upload(
    @CurrentUser() user: AuthContext,
    @UploadedFile() file?: UploadedFileLike,
  ): Promise<KnowledgeUploadResult> {
    if (!file?.buffer) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }
    return this.knowledge.upload(user.tenantId, file);
  }

  /** Texto extraído de un documento, para revisarlo antes de activarlo. */
  @Get(':id/preview')
  preview(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ preview: string; previewTruncated: boolean }> {
    return this.knowledge.preview(user.tenantId, id);
  }

  /** Confirma el documento: se fragmenta y la IA empieza a usarlo. */
  @Post(':id/activate')
  @Roles(UserRole.OWNER)
  activate(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KnowledgeDocumentDto> {
    return this.knowledge.activate(user.tenantId, id);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.knowledge.remove(user.tenantId, id);
  }
}
