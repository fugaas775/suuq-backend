import { StorefrontService } from './storefront.service';
import { HotelRoomStatus } from '../hospitality/entities/hotel-room.entity';

/**
 * A hotel has one room truth, and reservations are only half of it. A walk-in
 * checked in at the front desk has an open folio and no reservation at all — so
 * before this, a room that was physically occupied still read as bookable and
 * the app would sell it a second time.
 */
describe('StorefrontService.getHotelAvailability', () => {
  function buildService(opts: {
    rooms: Array<{ roomNumber: string; roomType: string }>;
    reservations?: Array<{ roomNumber: string }>;
    folios?: Array<{ roomNumber: string }>;
  }) {
    const queryBuilder = (rows: unknown[]) => {
      const qb: Record<string, jest.Mock> = {};
      for (const m of ['where', 'andWhere']) {
        qb[m] = jest.fn().mockReturnValue(qb);
      }
      qb.getMany = jest.fn().mockResolvedValue(rows);
      return qb;
    };

    const service = new StorefrontService(
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 5, branchId: 44, serviceFormat: 'HOTEL' }),
      } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 44 }) } as never,
      { createQueryBuilder: jest.fn(), find: jest.fn() } as never,
      {
        find: jest.fn().mockResolvedValue(
          opts.rooms.map((r) => ({
            ...r,
            status: HotelRoomStatus.ACTIVE,
            maxOccupancy: 2,
            description: null,
          })),
        ),
      } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(queryBuilder(opts.reservations ?? [])),
      } as never,
      {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(queryBuilder(opts.folios ?? [])),
      } as never,
    );

    // The catalog mirror is exercised elsewhere and needs a live product repo.
    jest
      .spyOn(
        service as unknown as { syncRoomsFromCatalog: () => Promise<void> },
        'syncRoomsFromCatalog',
      )
      .mockResolvedValue(undefined);

    return service;
  }

  const window = ['2026-08-10T12:00:00.000Z', '2026-08-12T12:00:00.000Z'];

  const threeRooms = [
    { roomNumber: '101', roomType: 'STANDARD' },
    { roomNumber: '102', roomType: 'STANDARD' },
    { roomNumber: '201', roomType: 'SUITE' },
  ];

  it('counts every active room when nothing is occupied', async () => {
    const service = buildService({ rooms: threeRooms });

    const res = await service.getHotelAvailability(5, window[0], window[1]);

    const standard = res.roomTypes.find((t) => t.roomType === 'STANDARD');
    expect(standard?.availableCount).toBe(2);
    expect(
      res.roomTypes.find((t) => t.roomType === 'SUITE')?.availableCount,
    ).toBe(1);
  });

  it('nets out rooms held by an overlapping reservation', async () => {
    const service = buildService({
      rooms: threeRooms,
      reservations: [{ roomNumber: '101' }],
    });

    const res = await service.getHotelAvailability(5, window[0], window[1]);

    expect(
      res.roomTypes.find((t) => t.roomType === 'STANDARD')?.availableCount,
    ).toBe(1);
  });

  it('nets out a walk-in with an open folio and no reservation', async () => {
    const service = buildService({
      rooms: threeRooms,
      folios: [{ roomNumber: '102' }],
    });

    const res = await service.getHotelAvailability(5, window[0], window[1]);

    // Occupied at the desk, invisible to the reservation table. Selling this
    // room again is a double-booked guest at check-in.
    expect(
      res.roomTypes.find((t) => t.roomType === 'STANDARD')?.availableCount,
    ).toBe(1);
  });

  it('does not double-count a room held by both a reservation and a folio', async () => {
    const service = buildService({
      rooms: threeRooms,
      reservations: [{ roomNumber: '101' }],
      folios: [{ roomNumber: '101' }],
    });

    const res = await service.getHotelAvailability(5, window[0], window[1]);

    // The usual case: a booked guest checked in. One room gone, not two.
    expect(
      res.roomTypes.find((t) => t.roomType === 'STANDARD')?.availableCount,
    ).toBe(1);
  });

  it('drops a room type entirely once all of its rooms are taken', async () => {
    const service = buildService({
      rooms: threeRooms,
      folios: [{ roomNumber: '201' }],
    });

    const res = await service.getHotelAvailability(5, window[0], window[1]);

    expect(res.roomTypes.find((t) => t.roomType === 'SUITE')).toBeUndefined();
  });
});
