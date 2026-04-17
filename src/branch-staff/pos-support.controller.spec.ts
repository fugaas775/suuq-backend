import { Test, TestingModule } from '@nestjs/testing';
import { BranchStaffService } from './branch-staff.service';
import { PosSupportController } from './pos-support.controller';

describe('PosSupportController', () => {
  let controller: PosSupportController;

  const branchStaffServiceMock = {
    getPortalAccessDiagnosticsByEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosSupportController],
      providers: [
        { provide: BranchStaffService, useValue: branchStaffServiceMock },
      ],
    }).compile();

    controller = module.get(PosSupportController);
  });

  it('returns support diagnostics for the requested email', async () => {
    branchStaffServiceMock.getPortalAccessDiagnosticsByEmail.mockResolvedValue({
      searchedEmail: 'global.me23@gmail.com',
      user: { id: 2008 },
      branchAssignments: [],
      workspaceActivationCandidates: [],
      summary: {
        status: 'ACTIVATION_REQUIRED',
        branchAssignmentCount: 0,
        activationCandidateCount: 1,
        canOpenNow: false,
        likelyRootCause:
          'Set a branch service format such as RETAIL before starting activation.',
        recommendedActions: [],
      },
    });

    const result = await controller.getPortalDiagnostics(
      'Global.Me23@gmail.com',
    );

    expect(
      branchStaffServiceMock.getPortalAccessDiagnosticsByEmail,
    ).toHaveBeenCalledWith('global.me23@gmail.com');
    expect(result).toEqual(
      expect.objectContaining({ searchedEmail: 'global.me23@gmail.com' }),
    );
  });
});
