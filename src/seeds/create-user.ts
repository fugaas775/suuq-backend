import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../auth/roles.enum';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const users = app.get(UsersService);

  // Accept email and password from args or env
  const [, , argEmail, argPassword, argDisplayName, argRole] = process.argv;
  const email = (argEmail || process.env.CREATE_EMAIL || '').trim();
  const password = (argPassword || process.env.CREATE_PASSWORD || '').trim();
  const displayName =
    (argDisplayName || process.env.CREATE_DISPLAY_NAME || '').trim() ||
    undefined;
  const roleRaw = (argRole || process.env.CREATE_ROLE || '')
    .toString()
    .trim()
    .toUpperCase();

  const validRoles = new Set(Object.keys(UserRole));
  const chosenRole = validRoles.has(roleRaw)
    ? ((UserRole as any)[roleRaw] as UserRole)
    : undefined;

  if (!email) {
    console.error(
      'Usage: ts-node src/seeds/create-user.ts <email> <password> [displayName]',
    );
    console.error('Or set CREATE_EMAIL / CREATE_PASSWORD env variables.');
    await app.close();
    process.exit(1);
    return;
  }
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    await app.close();
    process.exit(1);
    return;
  }

  try {
    const existing = await users.findByEmail(email);
    if (existing) {
      console.log(
        `User already exists: id=${existing.id}, email=${existing.email}`,
      );
      return;
    }
    const created = await users.create({
      email,
      password,
      displayName: displayName || 'Vendor Reviewer',
      roles: [chosenRole || UserRole.VENDOR],
      isActive: true,
      verified: true,
    });
    console.log(`Created user id=${created.id}, email=${created.email}`);
  } catch (e: any) {
    console.error('Create user failed:', e?.message || e);
    process.exitCode = 2;
  } finally {
    await app.close();
  }
}

run();
