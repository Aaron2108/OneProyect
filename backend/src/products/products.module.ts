import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Catálogo de productos. Exporta el servicio porque `AiModule` lo necesita para
 * la herramienta `consultar_producto`: la IA consulta el stock en vivo contra la
 * BD, no desde el prompt.
 */
@Module({
  imports: [AuthModule], // aporta JwtAuthGuard / JwtService para proteger los endpoints
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
