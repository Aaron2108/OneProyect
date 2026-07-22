import { Injectable, NotFoundException } from '@nestjs/common';
import { QuickReply } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';

/**
 * Respuestas rápidas (plantillas de mensaje) del tenant, compartidas por el
 * equipo. Todo filtrado por `tenantId` del token.
 */
@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string): Promise<QuickReply[]> {
    return this.prisma.quickReply.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(tenantId: string, dto: CreateQuickReplyDto): Promise<QuickReply> {
    return this.prisma.quickReply.create({
      data: { tenantId, title: dto.title, body: dto.body },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateQuickReplyDto): Promise<QuickReply> {
    await this.assertExists(tenantId, id);
    return this.prisma.quickReply.update({
      where: { id },
      data: { title: dto.title, body: dto.body },
    });
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    await this.assertExists(tenantId, id);
    await this.prisma.quickReply.delete({ where: { id } });
    return { ok: true };
  }

  private async assertExists(tenantId: string, id: string): Promise<void> {
    const owned = await this.prisma.quickReply.count({ where: { id, tenantId } });
    if (owned === 0) {
      throw new NotFoundException('Respuesta rápida no encontrada');
    }
  }
}
