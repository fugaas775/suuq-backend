import { Module, forwardRef, Global } from '@nestjs/common'; // 1. Import Global
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { RedisModule } from '../redis/redis.module';
import { EffectiveUserRoleService } from './effective-user-role.service';
import { PosBranchSecurity } from './entities/pos-branch-security.entity';
import { PosSessionRevocationService } from './pos-session-revocation.service';

@Global() // 2. Add the @Global() decorator
@Module({
  imports: [
    forwardRef(() => UsersModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN') },
      }),
    }),
    EmailModule,
    RedisModule,
    TypeOrmModule.forFeature([PosBranchSecurity]),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    ConfigService,
    EffectiveUserRoleService,
    PosSessionRevocationService,
  ],
  controllers: [AuthController],
  exports: [AuthService, PosSessionRevocationService],
})
export class AuthModule {}
