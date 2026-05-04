import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { VerificationMethod } from './entities/user.entity';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: {} }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('exposes verification license fields in user responses', () => {
    const result = plainToInstance(
      UserResponseDto,
      {
        id: 41,
        email: 'mrhalgan@gmail.com',
        verificationStatus: 'PENDING',
        verificationMethod: VerificationMethod.MANUAL,
        businessLicenseNumber: 'LIC-41',
        businessLicenseInfo: {
          tradeName: 'Mr Halgan Trading',
          status: 'ACTIVE',
        },
        verificationDocuments: [
          {
            url: 'https://cdn.example.com/licenses/41.pdf',
            name: 'business-license.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
      { excludeExtraneousValues: true },
    );

    expect(result.verificationMethod).toBe(VerificationMethod.MANUAL);
    expect(result.businessLicenseInfo).toEqual({
      tradeName: 'Mr Halgan Trading',
      status: 'ACTIVE',
    });
    expect(result.verificationDocuments).toEqual([
      {
        url: 'https://cdn.example.com/licenses/41.pdf',
        name: 'business-license.pdf',
        mimeType: 'application/pdf',
      },
    ]);
  });
});
