import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../auth/roles.enum';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  try {
    // Check if admin user already exists
    const existingAdmin = await usersService.findByEmail('admin@suuq.com');
    if (existingAdmin) {
      console.log('✅ Admin user already exists with email: admin@suuq.com');
      console.log(`   ID: ${existingAdmin.id}`);
      console.log(`   Roles: ${existingAdmin.roles.join(', ')}`);
      console.log(`   Active: ${existingAdmin.isActive}`);
      
      // Update roles if needed
      if (!existingAdmin.roles.includes(UserRole.SUPER_ADMIN)) {
        console.log('🔄 Updating user roles to include SUPER_ADMIN...');
        const updatedUser = await usersService.updateUserRoles(existingAdmin.id, [UserRole.SUPER_ADMIN, UserRole.ADMIN]);
        console.log(`✅ Updated roles: ${updatedUser.roles.join(', ')}`);
      }
    } else {
      // Create new admin user
      console.log('🔄 Creating new SUPER_ADMIN user...');
      const adminUser = await usersService.create({
        email: 'admin@suuq.com',
        password: 'Ugas0912615526Suuq', // ✅ Correct password
        displayName: 'Super Administrator',
        roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
        isActive: true,
        verified: true,
      });
      
      console.log('✅ SUPER_ADMIN user created successfully!');
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   ID: ${adminUser.id}`);
      console.log(`   Roles: ${adminUser.roles.join(', ')}`);
    }

    console.log('\n🔑 To get JWT token for admin access, login with:');
    console.log('   Email: admin@suuq.com');
    console.log('   Password: Ugas0912615526Suuq');
    
    console.log('\n📡 Example curl command to get token:');
    console.log('curl -X POST http://localhost:3000/api/auth/login \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"email": "admin@suuq.com", "password": "Ugas0912615526Suuq"}\'');

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
