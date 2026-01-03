import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const configService = app.get(ConfigService);

  const email = process.argv[2] || 'admin@suuq.com';
  console.log(`Generating token for ${email}...`);

  const user = await usersService.findByEmail(email);
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  const payload = { sub: user.id, email: user.email, roles: user.roles };
  const secret = configService.get<string>('JWT_SECRET') || 'secret';
  const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '1d';

  const accessToken = jwt.sign(payload, secret, {
    expiresIn: expiresIn as any,
  });

  console.log('Token:', accessToken);

  await app.close();
}

bootstrap();
