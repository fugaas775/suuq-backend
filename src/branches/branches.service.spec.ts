import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchesService } from './branches.service';
import { Branch } from './entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';

/**
 * Covers the admin branch list's `ownerNeverSignedIn` flag — the signal that an
 * admin-provisioned branch is waiting on an owner who cannot yet get in, which
 * is what precedes them signing up on a different address and silently forking
 * a second tenant.
 */
describe('BranchesService.adminListBranches', () => {
  let service: BranchesService;
  let branchesRepository: { findAndCount: jest.Mock; count: jest.Mock };

  const branchWithOwner = (id: number, owner: Partial<User> | null): Branch =>
    Object.assign(new Branch(), {
      id,
      name: `Branch ${id}`,
      ownerId: owner ? 100 + id : null,
      owner: owner ? Object.assign(new User(), owner) : null,
    });

  beforeEach(async () => {
    branchesRepository = {
      findAndCount: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: getRepositoryToken(VendorStore), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} as DataSource },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  it('flags an owner that has no way to sign in yet', async () => {
    branchesRepository.findAndCount.mockResolvedValue([
      [branchWithOwner(108, { id: 208, email: 'asalprintingp@gmail.com' })],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toMatchObject({
      id: 108,
      ownerNeverSignedIn: true,
    });
  });

  it.each([
    ['a linked Google account', { googleId: 'google-sub-1' }],
    ['a linked Apple account', { appleId: 'apple-sub-1' }],
    ['a password', { password: 'hashed' }],
  ])('does not flag an owner with %s', async (_label, credential) => {
    branchesRepository.findAndCount.mockResolvedValue([
      [
        branchWithOwner(110, {
          id: 210,
          email: 'owner@gmail.com',
          ...credential,
        }),
      ],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toMatchObject({ ownerNeverSignedIn: false });
  });

  it('does not flag an ownerless branch', async () => {
    branchesRepository.findAndCount.mockResolvedValue([
      [branchWithOwner(111, null)],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toMatchObject({ ownerNeverSignedIn: false });
  });

  // The global ClassSerializerInterceptor strips the owner's @Exclude()'d
  // password only while these are still Branch instances — spreading them into
  // plain objects would quietly start leaking the hash to admins.
  it('keeps the returned items as Branch instances', async () => {
    branchesRepository.findAndCount.mockResolvedValue([
      [branchWithOwner(108, { id: 208, email: 'owner@gmail.com' })],
      1,
    ]);

    const result = await service.adminListBranches();

    expect(result.items[0]).toBeInstanceOf(Branch);
    expect(result.items[0].owner).toBeInstanceOf(User);
  });
});
