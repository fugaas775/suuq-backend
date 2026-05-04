import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { EffectiveUserRoleService } from './effective-user-role.service';
import { DataSource } from 'typeorm';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    restoreDeletedUserByEmail: jest.Mock;
    createWithGoogle: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let effectiveUserRoleService: { applyEffectiveRoles: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      restoreDeletedUserByEmail: jest.fn(),
      createWithGoogle: jest.fn(),
    };
    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
    };
    effectiveUserRoleService = {
      applyEffectiveRoles: jest.fn(async (user) => ({
        ...user,
        roles: ['VENDOR', 'POS_MANAGER'],
      })),
    };
    dataSource = {
      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn(() => ({
            find: jest.fn().mockResolvedValue([]),
          })),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const values: Record<string, string> = {
                JWT_SECRET: 'jwt-secret',
                JWT_EXPIRES_IN: '1h',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_REFRESH_EXPIRES_IN: '7d',
              };
              return values[key];
            },
          },
        },
        { provide: EmailService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: DataSource, useValue: dataSource },
        {
          provide: EffectiveUserRoleService,
          useValue: effectiveUserRoleService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('signs tokens with effective roles instead of persisted roles', async () => {
    const user = {
      id: 41,
      email: 'dual@suuq.test',
      roles: ['VENDOR'],
    } as any;

    const result = await (service as any).generateTokens(user);

    expect(effectiveUserRoleService.applyEffectiveRoles).toHaveBeenCalledWith(
      user,
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      {
        sub: 41,
        email: 'dual@suuq.test',
        roles: ['VENDOR', 'POS_MANAGER'],
      },
      {
        secret: 'jwt-secret',
        expiresIn: '1h',
      },
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 41,
        email: 'dual@suuq.test',
        roles: ['VENDOR', 'POS_MANAGER'],
      },
    });
  });

  it('restores a deleted user on Google login instead of creating a new account', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.restoreDeletedUserByEmail.mockResolvedValue({
      id: 42,
      email: 'somopenschool@gmail.com',
      roles: ['CUSTOMER'],
      isActive: true,
    });

    (service as any).oauthClient = {
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({
          email: 'somopenschool@gmail.com',
          name: 'Som Open School',
          picture: 'https://example.test/avatar.png',
          sub: 'google-sub-42',
        }),
      }),
    };

    const result = await service.googleLogin({ idToken: 'google-id-token' });

    expect(usersService.restoreDeletedUserByEmail).toHaveBeenCalledWith(
      'somopenschool@gmail.com',
      expect.objectContaining({
        googleId: 'google-sub-42',
        isActive: true,
      }),
    );
    expect(usersService.createWithGoogle).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
  });
});
