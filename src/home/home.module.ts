import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { HomeV1Controller } from './v1.home.controller';
import { ProductsModule } from '../products/products.module';
import { Category } from '../categories/entities/category.entity';

@Module({
  imports: [
    forwardRef(() => ProductsModule),
    TypeOrmModule.forFeature([Category]),
  ],
  controllers: [HomeController, HomeV1Controller],
  providers: [HomeService],
  exports: [HomeService],
})
export class HomeModule {}
