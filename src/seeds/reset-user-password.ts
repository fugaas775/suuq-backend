import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { Logger } from '@nestjs/common';

async function run() {
  const logger = new Logger('ResetUserPassword');
  const app = await NestFactory.createApplicationContext(AppModule);
  const users = app.get(UsersService);

  // Accept email and password via CLI args or env
  const [, , argEmail, argPassword] = process.argv;
  const email = (argEmail || process.env.RESET_EMAIL || '').trim();
  const newPassword = (argPassword || process.env.RESET_PASSWORD || '').trim();

  if (!email) {
    logger.error(
      'Usage: ts-node src/seeds/reset-user-password.ts <email> <newPassword>',
    );
    logger.error('Or set RESET_EMAIL and RESET_PASSWORD env vars.');
    await app.close();
    process.exit(1);
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    logger.error('New password must be at least 8 characters.');
    await app.close();
    process.exit(1);
    return;
  }

  try {
    const user = await users.findByEmail(email);
    if (!user) {
      logger.error(`User not found for ${email}`);
      process.exitCode = 2;
      return;
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.isActive = true;
    await (users as any).userRepository.save(user);
    logger.log(`Password reset successful for ${email}.`);
  } catch (e: any) {
    logger.error('Password reset failed:', e?.message || e);
    process.exitCode = 3;
  } finally {
    await app.close();
  }
}

run();
