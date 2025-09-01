// Debug info (avoid logging secrets in clear text)
console.log(
  'DEBUG DB_PASSWORD:',
  typeof process.env.DB_PASSWORD,
  process.env.DB_PASSWORD ? '[REDACTED]' : '<missing>',
);
console.log(
  'DEBUG DB_DATABASE:',
  typeof process.env.DB_DATABASE,
  process.env.DB_DATABASE,
);
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { CountriesModule } from '../countries/countries.module';
import { Country } from '../countries/entities/country.entity';
import { CategoriesModule } from '../categories/categories.module';
import { Category } from '../categories/entities/category.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Use the async factory to ensure .env is loaded first
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        ssl: { rejectUnauthorized: false },
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [Country, Category], // Load needed entities for seeding
        synchronize: false,
      }),
    }),
    // Import modules that provide necessary services (like CountriesService)
    CountriesModule,
    CategoriesModule,
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedsModule {}
