import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../auth/roles.enum';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('CreateAdmin');
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  try {
    // Check if admin user already exists
    const existingAdmin = await usersService.findByEmail('admin@suuq.com');
    if (existingAdmin) {
      logger.log('✅ Admin user already exists with email: admin@suuq.com');
      logger.log(`   ID: ${existingAdmin.id}`);
      logger.log(`   Roles: ${existingAdmin.roles.join(', ')}`);
      logger.log(`   Active: ${existingAdmin.isActive}`);

      // Update roles if needed
      if (!existingAdmin.roles.includes(UserRole.SUPER_ADMIN)) {
        logger.log('🔄 Updating user roles to include SUPER_ADMIN...');
        const updatedUser = await usersService.updateUserRoles(
          existingAdmin.id,
          [UserRole.SUPER_ADMIN, UserRole.ADMIN],
        );
        logger.log(`✅ Updated roles: ${updatedUser.roles.join(', ')}`);
      }
    } else {
      // Create new admin user
      logger.log('🔄 Creating new SUPER_ADMIN user...');
      const adminUser = await usersService.create({
        email: 'admin@suuq.com',
        password: 'Ugas0912615526Suuq', // ✅ Correct password
        displayName: 'Super Administrator',
        roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
        isActive: true,
        verified: true,
      });

      logger.log('✅ SUPER_ADMIN user created successfully!');
      logger.log(`   Email: ${adminUser.email}`);
      logger.log(`   ID: ${adminUser.id}`);
      logger.log(`   Roles: ${adminUser.roles.join(', ')}`);
    }

    logger.log('\n🔑 To get JWT token for admin access, login with:');
    logger.log('   Email: admin@suuq.com');
    logger.log('   Password: Ugas0912615526Suuq');

    console.log('\n📡 Example curl command to get token:');
    console.log('curl -X POST http://localhost:3000/api/auth/login \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log(
      '  -d \'{"email": "admin@suuq.com", "password": "Ugas0912615526Suuq"}\'',
    );

    console.log('\n🛠️ Example admin API call:');
    console.log('curl -X GET http://localhost:3000/api/admin/stats \\');
    console.log('  -H "Authorization: Bearer <your-jwt-token>"');
  } catch (error: any) {
    console.error('❌ Error with admin user:', error.message);
  } finally {
    await app.close();
  }
}

bootstrap();
