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


describe('PosRegisterScheduleService.openDueSessions', () => {
  // Opens 00:00, closes 23:59 EAT — the schools' schedule.
  const SCHOOL = { id: 115, name: 'SMAQ School', registerOpensAt: '00:00', registerClosesAt: '23:59' };

  function make({ open = null, openedToday = null, last = { registerId: 'pos-s-web' }, branches = [SCHOOL] }: any = {}) {
    const branchesRepository = { find: jest.fn().mockResolvedValue(branches) };
    const saved: any[] = [];
    const registerSessionsRepository = {
      findOne: jest.fn(async ({ where, order }: any) => {
        if (order) return last;
        if (where.status === PosRegisterSessionStatus.OPEN) return open;
        return openedToday;
      }),
      count: jest.fn().mockResolvedValue(64),
      create: (x: any) => x,
      save: jest.fn(async (x: any) => { const row = { ...x, id: 2000 + saved.length }; saved.push(row); return row; }),
    };
    const service = new PosRegisterScheduleService(branchesRepository as any, registerSessionsRepository as any, { dispatchCloseReport: jest.fn() } as any);
    return { service, registerSessionsRepository, saved };
  }

  it('opens the day’s register at the opening time on the branch’s own till id', async () => {
    const { service, saved, registerSessionsRepository } = make();
    // 00:00 EAT on 18 Oct = 21:00Z on the 17th.
    const now = new Date('2026-10-17T21:00:00Z');
    await expect(service.openDueSessions(now)).resolves.toEqual([2000]);
    expect(saved[0]).toMatchObject({
      branchId: 115, registerId: 'pos-s-web', status: PosRegisterSessionStatus.OPEN,
      openedByName: 'Scheduled open', openingFloat: null, branchSessionNumber: 65,
      metadata: { scheduledOpen: { opensAt: '00:00', scheduledFor: '2026-10-17T21:00:00.000Z' } },
    });
    // "Opened since today's opening time" is asked from 00:00 EAT.
    const since = registerSessionsRepository.findOne.mock.calls.find(([a]: any) => a.where.openedAt)[0].where.openedAt.value as Date;
    expect(since.toISOString()).toBe('2026-10-17T21:00:00.000Z');
  });

  it('catches up later in the day when nothing was opened yet', async () => {
    const { service } = make();
    await expect(service.openDueSessions(new Date('2026-10-18T07:15:00Z'))).resolves.toEqual([2000]);
  });

  it('leaves a branch alone when a register is open, or one was opened (and closed by hand) since the opening time', async () => {
    expect(await make({ open: { id: 1 } }).service.openDueSessions(new Date('2026-10-18T07:15:00Z'))).toEqual([]);
    expect(await make({ openedToday: { id: 2, status: 'CLOSED' } }).service.openDueSessions(new Date('2026-10-18T07:15:00Z'))).toEqual([]);
  });

  it('never opens in closed hours — the 23:59 minute — and falls back to pos-s-web for a branch with no history', async () => {
    expect(await make().service.openDueSessions(new Date('2026-10-18T20:59:30Z'))).toEqual([]);
    const { service, saved } = make({ last: null, branches: [{ id: 9, name: 'QSR', registerOpensAt: '07:00', registerClosesAt: '22:00' }] });
    expect(await service.openDueSessions(new Date('2026-10-18T03:30:00Z'))).toEqual([]); // 06:30 EAT
    expect(await service.openDueSessions(new Date('2026-10-18T04:00:00Z'))).toEqual([2000]); // 07:00 EAT
    expect(saved[0].registerId).toBe('pos-s-web');
  });
});
