import { SchoolRoomService, roomCapacity } from './school-room.service';

function makeService({ rooms = [] as any[], classes = [] as any[] } = {}) {
  let nextId = 10;
  const roomRepo: any = {
    find: async ({ where }: any) =>
      rooms.filter((r) => r.branchId === where.branchId),
    findOne: async ({ where }: any) =>
      rooms.find(
        (r) =>
          Number(r.id) === Number(where.id) && r.branchId === where.branchId,
      ) || null,
    count: async ({ where }: any) =>
      rooms.filter((r) => r.branchId === where.branchId).length,
    create: (p: any) => ({ ...p }),
    save: async (row: any) => {
      if (!row.id) {
        row.id = nextId++;
        rooms.push(row);
      }
      return row;
    },
    remove: async (row: any) => {
      rooms.splice(rooms.indexOf(row), 1);
    },
  };
  const classRepo: any = {
    count: async ({ where }: any) =>
      classes.filter(
        (c) =>
          c.branchId === where.branchId &&
          Number(c.roomId) === Number(where.roomId),
      ).length,
  };
  return { svc: new SchoolRoomService(roomRepo, classRepo), rooms };
}

describe('rooms and desks', () => {
  it('seats (desks − broken) × seats per desk, or the mat’s own count', () => {
    expect(
      roomCapacity({
        seating: 'DESK',
        desks: 12,
        brokenDesks: 0,
        seatsPerDesk: 3,
        matCapacity: null,
      }),
    ).toBe(36);
    expect(
      roomCapacity({
        seating: 'DESK',
        desks: 13,
        brokenDesks: 2,
        seatsPerDesk: 3,
        matCapacity: null,
      }),
    ).toBe(33);
    expect(
      roomCapacity({
        seating: 'MAT',
        desks: 0,
        brokenDesks: 0,
        seatsPerDesk: 3,
        matCapacity: 25,
      }),
    ).toBe(25);
    expect(
      roomCapacity({
        seating: 'MAT',
        desks: 0,
        brokenDesks: 0,
        seatsPerDesk: 3,
        matCapacity: null,
      }),
    ).toBeNull();
  });

  it('lists a room once by name, edits its desks, refuses more broken than there are, and removes it only when empty', async () => {
    const { svc, rooms } = makeService({
      classes: [{ branchId: 115, roomId: 10 }],
    });
    const a = await svc.create({
      branchId: 115,
      name: '5aad & 6aad',
      desks: 12,
    });
    expect(a).toMatchObject({
      name: '5aad & 6aad',
      desks: 12,
      brokenDesks: 0,
      seatsPerDesk: 3,
      capacity: 36,
    });
    await expect(
      svc.create({ branchId: 115, name: '5AAD & 6AAD' }),
    ).rejects.toThrow(/already listed/);
    const b = await svc.update(a.id, { branchId: 115, brokenDesks: 2 } as any);
    expect(b.capacity).toBe(30);
    await expect(
      svc.update(a.id, { branchId: 115, brokenDesks: 13 } as any),
    ).rejects.toThrow(/13 broken desks in a room of 12/);
    await expect(svc.remove(a.id, 115)).rejects.toThrow(/1 class still sit/);
    const kg = await svc.create({
      branchId: 115,
      name: 'KG II',
      seating: 'MAT',
      matCapacity: 22,
    });
    expect(kg.capacity).toBe(22);
    await svc.remove(kg.id, 115);
    expect(rooms.map((r) => r.name)).toEqual(['5aad & 6aad']);
  });
});
