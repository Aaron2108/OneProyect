import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { AiContextPreview, TestChatReply } from '../business-profile/business-profile.types';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { TestChatDto } from './test-chat.dto';

/** Consulta por defecto para mostrar qué documentación se recupera. */
const DEFAULT_SAMPLE_QUERY = '¿Cuál es el horario de atención y qué servicios ofrecen?';

/**
 * Contacto ficticio del chat de prueba. No es —ni puede ser— un id real: así la
 * memoria de contexto no devuelve recuerdos de un cliente de verdad y ninguna
 * herramienta podría apuntar a él aunque se ejecutaran.
 */
const TEST_CONTACT_ID = 'chat-de-prueba';

/**
 * Contexto armado de la IA, para el apartado "Agente IA" del panel: el dueño ve
 * exactamente el system prompt que va a recibir el modelo, cuántos tokens ocupa
 * y qué documentos lo alimentan.
 *
 * Vive en su propio módulo porque compone tres piezas —perfil del negocio,
 * conocimiento y motor de IA— y `AiModule` ya depende de las otras dos: poner
 * este endpoint dentro de cualquiera de ellas crearía una dependencia circular.
 */
@Controller('ai-context')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiContextController {
  constructor(
    private readonly ai: AiService,
    private readonly businessProfile: BusinessProfileService,
    private readonly knowledge: KnowledgeService,
  ) {}

  /**
   * `query` simula un mensaje del cliente: la documentación se recupera por
   * similitud, así que el contexto cambia según lo que pregunten.
   */
  @Get()
  async get(
    @CurrentUser() user: AuthContext,
    @Query('query') query?: string,
  ): Promise<AiContextPreview> {
    const sampleQuery = query?.trim() || DEFAULT_SAMPLE_QUERY;
    const tenantName = await this.businessProfile.tenantName(user.tenantId);

    const { prompt, knowledgeUsed } = await this.ai.previewSystemPrompt(
      user.tenantId,
      tenantName,
      sampleQuery,
    );
    const { tokens, estimated } = await this.ai.countPromptTokens(prompt);
    const documents = await this.knowledge.activeSummary(user.tenantId);

    return {
      prompt,
      sampleQuery,
      tokens,
      tokensEstimated: estimated,
      knowledgeChunksUsed: knowledgeUsed,
      documents,
    };
  }

  /**
   * Chat de prueba: el dueño conversa con su propio agente desde el panel, sin
   * WhatsApp y sin un cliente real de por medio.
   *
   * Las herramientas se simulan (`simulateTools`): probar el agente no puede
   * crear citas ni recordatorios de verdad en la agenda del negocio. Lo que el
   * agente habría hecho se devuelve en `simulatedTools` para que se vea.
   *
   * Solo el OWNER, y con un límite propio: cada mensaje es una llamada pagada al
   * modelo, y el límite global de 100/min sería demasiado caro.
   */
  @Post('test-chat')
  @HttpCode(200)
  @Roles(UserRole.OWNER)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async testChat(
    @CurrentUser() user: AuthContext,
    @Body() dto: TestChatDto,
  ): Promise<TestChatReply> {
    if (!this.ai.isEnabled()) {
      throw new ServiceUnavailableException(
        'El agente no está configurado: falta la API key del proveedor de IA.',
      );
    }

    const tenantName = await this.businessProfile.tenantName(user.tenantId);
    const reply = await this.ai.respond(
      {
        tenantId: user.tenantId,
        tenantName,
        contactId: TEST_CONTACT_ID,
        contactName: 'Cliente de prueba',
        contactPhone: '+00000000000',
        conversationId: TEST_CONTACT_ID,
      },
      dto.messages.map((m) => ({ role: m.role, text: m.text })),
      { simulateTools: true },
    );

    return { text: reply.text, simulatedTools: reply.simulatedTools ?? [] };
  }
}
