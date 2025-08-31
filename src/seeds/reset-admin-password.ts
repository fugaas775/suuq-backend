import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../auth/roles.enum';
import * as bcrypt from 'bcrypt';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const users = app.get(UsersService);
  const email = process.env.ADMIN_EMAIL || 'admin@suuq.com';
  const newPassword = process.env.ADMIN_PASSWORD || 'Ugas0912615526Suuq';
  try {
    const user = await users.findByEmail(email);
    if (!user) {
      console.log(`Admin not found for ${email}. Creating...`);
      const created = await users.create({
        email,
        password: newPassword,
        displayName: 'Super Administrator',
        roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
        isActive: true,
        verified: true,
      });
      console.log(`Created admin id=${created.id}`);
    } else {
      console.log(
        `Found admin id=${user.id}. Forcing password reset and role sync...`,
      );
      user.password = await bcrypt.hash(newPassword, 10);
      const roles = new Set([
        ...(user.roles || []),
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
      ]);
      (user as any).roles = Array.from(roles);
      (user as any).isActive = true;
      await (users as any).userRepository.save(user);
      console.log('Updated password and roles.');
    }
    console.log(`Use credentials -> email: ${email}, password: ${newPassword}`);
  } catch (e: any) {
    console.error('Reset failed:', e?.message || e);
  } finally {
    await app.close();
  }
}

run();
