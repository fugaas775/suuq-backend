import { resolveBranchPresence } from './operating-hours';

/**
 * "Open now" is decided on the server against the shop's own clock (EAT), never
 * on the shopper's device. These tests pin the cases that a naive
 * `open <= now < close` check gets wrong.
 */
describe('resolveBranchPresence', () => {
  // 2026-08-03 is a Monday. EAT is UTC+3, so 06:00Z is 09:00 in the shop.
  const mondayMorning = new Date('2026-08-03T06:00:00.000Z');

  const nineToFive = {
    MON: { open: '08:00', close: '17:00' },
    TUE: { open: '08:00', close: '17:00' },
    SUN: { closed: true },
  };

  it('reports unknown, not closed, when a shop published no hours', () => {
    // A shop that never filled this in must not be shown as shut.
    expect(resolveBranchPresence(null, mondayMorning)).toEqual({
      isOpenNow: null,
      nextOpenAt: null,
    });
    expect(resolveBranchPresence({}, mondayMorning)).toEqual({
      isOpenNow: null,
      nextOpenAt: null,
    });
  });

  it('is open inside the shop-local window', () => {
    const presence = resolveBranchPresence(nineToFive, mondayMorning);

    expect(presence.isOpenNow).toBe(true);
    expect(presence.nextOpenAt).toBeNull();
  });

  it('uses EAT, not UTC', () => {
    // 18:00Z is 21:00 in the shop — after a 17:00 close. Reading this as UTC
    // would call it open.
    const presence = resolveBranchPresence(
      nineToFive,
      new Date('2026-08-03T18:00:00.000Z'),
    );

    expect(presence.isOpenNow).toBe(false);
  });

  it('reports when a shop opens later the same day', () => {
    // 03:00Z = 06:00 EAT, two hours before opening.
    const presence = resolveBranchPresence(
      nineToFive,
      new Date('2026-08-03T03:00:00.000Z'),
    );

    expect(presence.isOpenNow).toBe(false);
    // 08:00 EAT == 05:00Z the same day.
    expect(presence.nextOpenAt).toBe('2026-08-03T05:00:00.000Z');
  });

  it('skips closed days when looking ahead', () => {
    const satOnly = {
      SAT: { open: '10:00', close: '14:00' },
      SUN: { closed: true },
    };
    const presence = resolveBranchPresence(satOnly, mondayMorning);

    expect(presence.isOpenNow).toBe(false);
    // Next Saturday 10:00 EAT == 07:00Z on 2026-08-08.
    expect(presence.nextOpenAt).toBe('2026-08-08T07:00:00.000Z');
  });

  it('keeps a late-night shop open past midnight', () => {
    const lateBar = {
      SUN: { open: '18:00', close: '02:00' },
      MON: { open: '18:00', close: '02:00' },
    };
    // 2026-08-03T00:30Z is 03:30 EAT Monday — past the 02:00 close.
    expect(
      resolveBranchPresence(lateBar, new Date('2026-08-03T00:30:00.000Z'))
        .isOpenNow,
    ).toBe(false);

    // 22:30Z Sunday is 01:30 EAT Monday, still inside Sunday's overnight window.
    expect(
      resolveBranchPresence(lateBar, new Date('2026-08-02T22:30:00.000Z'))
        .isOpenNow,
    ).toBe(true);
  });

  it('ignores unusable entries rather than trusting them', () => {
    const broken = {
      MON: { open: 'nonsense', close: '17:00' },
      TUE: { open: '08:00', close: '17:00' },
    };
    const presence = resolveBranchPresence(broken, mondayMorning);

    // Monday is unreadable, so it does not count as open; Tuesday is next.
    expect(presence.isOpenNow).toBe(false);
    expect(presence.nextOpenAt).toBe('2026-08-04T05:00:00.000Z');
  });

  it('reports closed with no next opening when every day is shut', () => {
    const presence = resolveBranchPresence(
      { MON: { closed: true }, TUE: { closed: true } },
      mondayMorning,
    );

    expect(presence).toEqual({ isOpenNow: false, nextOpenAt: null });
  });
});
