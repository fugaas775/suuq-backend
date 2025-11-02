import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const users = app.get(UsersService);

  // Accept email and password via CLI args or env
  const [, , argEmail, argPassword] = process.argv;
  const email = (argEmail || process.env.RESET_EMAIL || '').trim();
  const newPassword = (argPassword || process.env.RESET_PASSWORD || '').trim();

  if (!email) {
    console.error('Usage: ts-node src/seeds/reset-user-password.ts <email> <newPassword>');
    console.error('Or set RESET_EMAIL and RESET_PASSWORD env vars.');
    await app.close();
    process.exit(1);
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    console.error('New password must be at least 8 characters.');
    await app.close();
    process.exit(1);
    return;
  }

  try {
    const user = await users.findByEmail(email);
    if (!user) {
      console.error(`User not found for ${email}`);
      process.exitCode = 2;
      return;
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.isActive = true;
    await (users as any).userRepository.save(user);
    console.log(`Password reset successful for ${email}.`);
  } catch (e: any) {
    console.error('Password reset failed:', e?.message || e);
    process.exitCode = 3;
  } finally {
    await app.close();
  }
}

run();
