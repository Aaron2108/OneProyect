import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessProfileService } from '../business-profile/business-profile.service';
import { AiContextPreview } from '../business-profile/business-profile.types';
import { KnowledgeService } from '../knowledge/knowledge.service';

/** Consulta por defecto para mostrar qué documentación se recupera. */
const DEFAULT_SAMPLE_QUERY = '¿Cuál es el horario de atención y qué servicios ofrecen?';

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
@UseGuards(JwtAuthGuard)
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
}
