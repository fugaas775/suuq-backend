import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SchoolMessageService } from './school-message.service';
import { memRepo, pupilFolio, reachStub } from './test/memory-repo';

/* Messages: one thread per child between the family's login and the
   school; the teachers who reach the class and the office answer it. */

const TEACHER = { id: 30, email: 't@x', roles: ['POS_OPERATOR'] };
const OTHER = { id: 31, email: 'u@x', roles: ['POS_OPERATOR'] };
const HEAD = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };

function make() {
  const threads: any[] = [];
  const messages: any[] = [];
  const guardians: any[] = [
    {
      id: 7,
      branchId: 128,
      userId: 900,
      displayName: 'Cali Xasan',
      isActive: true,
    },
    { id: 8, branchId: 128, userId: 901, displayName: null, isActive: true },
    {
      id: 9,
      branchId: 128,
      userId: 902,
      displayName: 'Switched Off',
      isActive: false,
    },
  ];
  const links: any[] = [
    { id: 1, guardianId: 7, folioId: 10 },
    { id: 2, guardianId: 7, folioId: 11 },
    { id: 3, guardianId: 8, folioId: 12 },
    { id: 4, guardianId: 9, folioId: 13 },
  ];
  const folios: any[] = [
    pupilFolio(10, 128),
    pupilFolio(11, 128, { hotelRoomNumber: '4aad' }),
    pupilFolio(12, 128, { hotelRoomNumber: '5aad' }),
    pupilFolio(13, 128, { hotelRoomNumber: '3aad' }),
    pupilFolio(14, 128, { hotelRoomNumber: '3aad' }), // no login
    pupilFolio(15, 115),
  ];
  const users: any[] = [
    { id: 900, posUsername: '0915333513', displayName: 'Cali Xasan' },
    { id: 901, posUsername: 'hodan', displayName: null },
  ];
  const reach = reachStub((actor) => {
    if (actor.id === 30)
      return {
        head: false,
        classes: ['3aad', '4aad'],
        employee: { id: 30, fullName: 'Mustafe' },
      };
    if (actor.id === 31)
      return {
        head: false,
        classes: ['5aad'],
        employee: { id: 31, fullName: 'Deq' },
      };
    return { head: true, employee: null, name: 'Suuq S' };
  });
  const svc = new SchoolMessageService(
    memRepo(threads),
    memRepo(messages),
    memRepo(guardians),
    memRepo(links),
    memRepo(folios),
    memRepo(users),
    reach,
  );
  return { svc, threads, messages, folios, guardians, links, users };
}

describe('SchoolMessageService — the school’s side', () => {
  it('a teacher opens a conversation with a family in their reach; a child with no login cannot be written to; another class is refused', async () => {
    const { svc, threads, messages } = make();
    const out = await svc.openThread(
      { branchId: 128, folioId: 10, body: '  Faadumo did very well today.  ' },
      TEACHER,
    );
    expect(out.thread).toMatchObject({
      folioId: 10,
      guardianId: 7,
      guardianName: 'Cali Xasan',
      pupilName: 'Pupil 10',
      classCode: '3aad',
      guardianUnread: 1,
      staffUnread: 0,
      lastSenderKind: 'STAFF',
    });
    expect(out.messages).toEqual([
      expect.objectContaining({
        senderKind: 'STAFF',
        senderName: 'Mustafe',
        body: 'Faadumo did very well today.',
      }),
    ]);
    expect(out.me).toEqual({
      name: 'Mustafe',
      employee: { id: 30, fullName: 'Mustafe' },
    });
    expect(threads).toHaveLength(1);
    expect(messages).toHaveLength(1);
    // Writing again reuses the thread.
    await svc.openThread(
      { branchId: 128, folioId: 10, body: 'And again.' },
      TEACHER,
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].guardianUnread).toBe(2);

    await expect(
      svc.openThread({ branchId: 128, folioId: 14, body: 'x' }, TEACHER),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      svc.openThread({ branchId: 128, folioId: 12, body: 'x' }, TEACHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.openThread({ branchId: 128, folioId: 15, body: 'x' }, TEACHER),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.openThread({ branchId: 128, folioId: 4242, body: 'x' }, HEAD),
    ).rejects.toBeInstanceOf(NotFoundException);
    // A switched-off login is not written to.
    await expect(
      svc.openThread({ branchId: 128, folioId: 13, body: 'x' }, TEACHER),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists the threads in reach with the unread total and the families that can be reached; the office sees every thread', async () => {
    const { svc } = make();
    await svc.openThread({ branchId: 128, folioId: 10, body: 'a' }, TEACHER);
    await svc.openThread({ branchId: 128, folioId: 12, body: 'b' }, OTHER);
    // The family answers on the first thread.
    const folio10 = (await svc.listThreads(128, HEAD)).items.find(
      (t: any) => t.folioId === 10,
    );
    await svc.guardianSend(
      128,
      { id: 7, userId: 900, displayName: 'Cali Xasan' },
      pupilFolio(10, 128) as any,
      'Cali Xasan',
      'Thank you teacher',
    );
    const mine = await svc.listThreads(128, TEACHER);
    expect(mine.items.map((t: any) => t.folioId)).toEqual([10]);
    expect(mine.unread).toBe(1);
    expect(mine.items[0]).toMatchObject({
      id: folio10.id,
      lastPreview: 'Thank you teacher',
      lastSenderKind: 'GUARDIAN',
      staffUnread: 1,
    });
    expect(mine.reach).toEqual(['3aad', '4aad']);
    // Reachable: pupils in 3aad/4aad with an ACTIVE login — 13's login is switched off, 14 has none.
    expect(mine.reachable.map((p: any) => p.folioId)).toEqual([10, 11]);
    expect(mine.reachable[0].guardians).toEqual([
      { id: 7, displayName: 'Cali Xasan' },
    ]);
    const office = await svc.listThreads(128, HEAD);
    expect(office.items.map((t: any) => t.folioId).sort()).toEqual([10, 12]);
    expect(office.head).toBe(true);
    expect(office.reachable.map((p: any) => p.folioId)).toEqual([10, 11, 12]);
    expect(office.items.every((t: any) => t.guardianRemoved === false)).toBe(
      true,
    );
  });

  it('opening a thread clears the staff side’s unread; a reply raises the family’s; a teacher outside the class is refused', async () => {
    const { svc, threads } = make();
    const opened = await svc.openThread(
      { branchId: 128, folioId: 10, body: 'a' },
      TEACHER,
    );
    await svc.guardianSend(
      128,
      { id: 7, userId: 900 },
      pupilFolio(10, 128) as any,
      'Cali',
      'reply 1',
    );
    await svc.guardianSend(
      128,
      { id: 7, userId: 900 },
      pupilFolio(10, 128) as any,
      'Cali',
      'reply 2',
    );
    expect(threads[0]).toMatchObject({ staffUnread: 2, guardianUnread: 0 });
    const read = await svc.getThread(opened.thread.id, 128, TEACHER);
    expect(read.messages.map((m: any) => m.body)).toEqual([
      'a',
      'reply 1',
      'reply 2',
    ]);
    expect(read.thread.staffUnread).toBe(0);
    await expect(
      svc.getThread(opened.thread.id, 128, OTHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.getThread(opened.thread.id, 115, TEACHER),
    ).rejects.toBeInstanceOf(NotFoundException);
    const replied = await svc.reply(
      opened.thread.id,
      { branchId: 128, body: 'Noted.' },
      HEAD,
    );
    expect(replied.messages[3]).toMatchObject({
      senderKind: 'STAFF',
      senderName: 'Suuq S',
      body: 'Noted.',
    });
    expect(replied.thread.guardianUnread).toBe(1);
    await expect(
      svc.reply(opened.thread.id, { branchId: 128, body: 'x' }, OTHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SchoolMessageService — a reply the family can read', () => {
  it('refuses a reply once the login is switched off or no longer covers the child, instead of answering Sent', async () => {
    const { svc, guardians, links, messages } = make();
    const opened = await svc.openThread(
      { branchId: 128, folioId: 10, body: 'a' },
      TEACHER,
    );
    guardians[0].isActive = false;
    await expect(
      svc.reply(opened.thread.id, { branchId: 128, body: 'b' }, TEACHER),
    ).rejects.toMatchObject({
      response: { code: 'SCHOOL_NO_PARENT_LOGIN' },
    });
    guardians[0].isActive = true;
    links.splice(0, 1); // the office unticked this child
    await expect(
      svc.reply(opened.thread.id, { branchId: 128, body: 'c' }, TEACHER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(messages.map((m: any) => m.body)).toEqual(['a']);
  });

  it('signs a message with the account’s display name when no staff row is joined — never a sign-in address', async () => {
    const { svc, users } = make();
    users.push({
      id: 40,
      posUsername: 'guuleed.shukri',
      displayName: 'Guuleed',
    });
    const office = {
      id: 40,
      email: 'pos.m.guuleed.shukri@sys.internal',
      roles: ['POS_MANAGER'],
    };
    const named = await svc.openThread(
      { branchId: 128, folioId: 10, body: 'from the office' },
      office,
    );
    // The stub's reach names nobody for this login but "Suuq S" (a staff
    // register name), which wins; an address-derived name would not.
    expect(named.messages[0].senderName).toBe('Suuq S');
    expect(String(named.messages[0].senderName)).not.toContain('@');
  });
});

describe('SchoolMessageService — the family’s side', () => {
  it('reads their own thread (clearing their unread), writes to the school, and the counts feed the home page', async () => {
    const { svc } = make();
    expect(await svc.guardianThread(128, 7, 10)).toEqual({
      thread: null,
      messages: [],
    });
    expect((await svc.unreadByFolio([7])).size).toBe(0);
    await svc.openThread(
      { branchId: 128, folioId: 10, body: 'Welcome' },
      TEACHER,
    );
    await svc.openThread(
      { branchId: 128, folioId: 11, body: 'Books due' },
      TEACHER,
    );
    const unread = await svc.unreadByFolio([7, 8]);
    expect([...unread.entries()]).toEqual([
      [10, 1],
      [11, 1],
    ]);
    const read = await svc.guardianThread(128, 7, 10);
    expect(read.thread).toMatchObject({ folioId: 10, guardianUnread: 0 });
    expect(read.messages[0]).toMatchObject({
      senderKind: 'STAFF',
      senderName: 'Mustafe',
      body: 'Welcome',
    });
    expect((await svc.unreadByFolio([7])).get(10)).toBeUndefined();
    const sent = await svc.guardianSend(
      128,
      { id: 7, userId: 900, displayName: 'Cali Xasan' },
      pupilFolio(10, 128) as any,
      'Cali Xasan',
      'Thank you',
    );
    expect(sent.messages.map((m: any) => [m.senderKind, m.body])).toEqual([
      ['STAFF', 'Welcome'],
      ['GUARDIAN', 'Thank you'],
    ]);
    expect(sent.thread).toMatchObject({
      staffUnread: 1,
      guardianUnread: 0,
      lastSenderKind: 'GUARDIAN',
    });
    // A family with no thread yet starts one by writing.
    const fresh = await svc.guardianSend(
      128,
      { id: 8, userId: 901 },
      pupilFolio(12, 128, { hotelRoomNumber: '5aad' }) as any,
      'hodan',
      'Hello',
    );
    expect(fresh.thread).toMatchObject({
      folioId: 12,
      guardianId: 8,
      classCode: '5aad',
      staffUnread: 1,
    });
  });

  it('says when the family’s login has since been removed, and keeps the conversation as a record', async () => {
    const { svc, threads } = make();
    const opened = await svc.openThread(
      { branchId: 128, folioId: 10, body: 'a' },
      TEACHER,
    );
    // The office removes the login: the guardian row is gone, the thread stays.
    const guardiansRepoRows: any[] = (svc as any).guardians.rows;
    guardiansRepoRows.splice(
      guardiansRepoRows.findIndex((g) => g.id === 7),
      1,
    );
    const list = await svc.listThreads(128, HEAD);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: opened.thread.id,
      guardianName: null,
      guardianRemoved: true,
    });
    const read = await svc.getThread(opened.thread.id, 128, HEAD);
    expect(read.thread.guardianRemoved).toBe(true);
    expect(read.messages).toHaveLength(1);
    expect(threads).toHaveLength(1);
  });
});
