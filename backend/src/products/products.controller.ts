import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Product, UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ImportReport, ProductsService } from './products.service';

/** Tope del archivo de importación (2000 filas caben de sobra en 2 MB). */
const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** Forma mínima del archivo que entrega multer, sin depender de tipos globales de Express. */
interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Catálogo de productos. Lectura para todo el equipo (un agente necesita
 * consultar disponibilidad al atender); escritura solo del OWNER, igual que el
 * resto de la configuración del negocio.
 */
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentUser() user: AuthContext, @Query() query: ListProductsDto) {
    return this.products.list(user.tenantId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<Product> {
    return this.products.get(user.tenantId, id);
  }

  @Post()
  @Roles(UserRole.OWNER)
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.products.create(user.tenantId, dto);
  }

  /**
   * Importación masiva desde CSV. Se envía como multipart porque un catálogo de
   * cientos de productos no cabe cómodamente en un JSON escrito a mano.
   */
  @Post('import')
  @HttpCode(200)
  @Roles(UserRole.OWNER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CSV_BYTES } }))
  importCsv(
    @CurrentUser() user: AuthContext,
    @UploadedFile() file?: UploadedFileLike,
  ): Promise<ImportReport> {
    if (!file) throw new BadRequestException('Falta el archivo CSV.');
    // Se decodifica como UTF-8; el BOM que antepone Excel lo quita el parser.
    return this.products.importCsv(user.tenantId, file.buffer.toString('utf8'));
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.products.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.OWNER)
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<void> {
    return this.products.remove(user.tenantId, id);
  }
}
