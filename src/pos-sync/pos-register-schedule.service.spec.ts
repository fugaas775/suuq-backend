import { PosRegisterScheduleService } from './pos-register-schedule.service';
import { PosRegisterSessionStatus } from './entities/pos-register-session.entity';

describe('PosRegisterScheduleService.closeDueSessions', () => {
  // 22:01 EAT on 16 Oct.
  const now = new Date('2026-10-16T19:01:00Z');

  function make(sessions: any[], affected = 1) {
    const branchesRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 3,
          name: 'SMAK QSR',
          registerClosesAt: '22:00',
          serviceFormat: 'QSR',
        },
      ]),
    };
    const registerSessionsRepository = {
      find: jest.fn().mockResolvedValue(sessions),
      update: jest.fn().mockResolvedValue({ affected }),
      findOne: jest.fn(async ({ where }) => ({
        id: where.id,
        status: 'CLOSED',
      })),
    };
    const reportService = { dispatchCloseReport: jest.fn() };
    const service = new PosRegisterScheduleService(
      branchesRepository as any,
      registerSessionsRepository as any,
      reportService as any,
    );
    return { service, registerSessionsRepository, reportService };
  }

  it("closes sessions opened before tonight's closing time and reports each once", async () => {
    const { service, registerSessionsRepository, reportService } = make([
      { id: 40, metadata: { deviceLabel: 'Till 1' } },
    ]);
    await expect(service.closeDueSessions(now)).resolves.toEqual([40]);

    expect(registerSessionsRepository.find).toHaveBeenCalledWith({
      where: expect.objectContaining({
        branchId: 3,
        status: PosRegisterSessionStatus.OPEN,
      }),
    });
    // Only sessions opened before 22:00 EAT tonight (19:00Z).
    const openedBefore = registerSessionsRepository.find.mock.calls[0][0].where
      .openedAt.value as Date;
    expect(openedBefore.toISOString()).toBe('2026-10-16T19:00:00.000Z');

    expect(registerSessionsRepository.update).toHaveBeenCalledWith(
      { id: 40, status: PosRegisterSessionStatus.OPEN },
      expect.objectContaining({
        status: PosRegisterSessionStatus.CLOSED,
        closedByName: 'Scheduled close',
        metadata: {
          deviceLabel: 'Till 1',
          scheduledClose: {
            closesAt: '22:00',
            scheduledFor: '2026-10-16T19:00:00.000Z',
            cashCounted: false,
          },
        },
      }),
    );
    expect(reportService.dispatchCloseReport).toHaveBeenCalledTimes(1);
    expect(reportService.dispatchCloseReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 40 }),
      { serviceFormat: 'QSR' },
    );
  });

  it('sends no report when a till closed the session first', async () => {
    const { service, reportService } = make([{ id: 41, metadata: null }], 0);
    await expect(service.closeDueSessions(now)).resolves.toEqual([]);
    expect(reportService.dispatchCloseReport).not.toHaveBeenCalled();
  });
});
