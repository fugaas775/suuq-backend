import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const jwtService = app.get(JwtService);
  const configService = app.get(ConfigService);

  // Use vendor ID 128
  const user = await usersService.findById(128);
  if (!user) {
    console.error('User 128 not found');
    process.exit(1);
  }

  const payload = { sub: user.id, email: user.email, roles: user.roles };
  const accessToken = await jwtService.signAsync(payload, {
    secret: configService.get<string>('JWT_SECRET'),
    expiresIn: configService.get<string>('JWT_EXPIRES_IN'),
  });

  console.log('Token:', accessToken);

  await app.close();
}

bootstrap();
