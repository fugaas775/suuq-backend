import {
  defaultExpiry,
  isWarningActive,
  nextWarningStep,
  summarizeWarnings,
} from './school-staff-warning.policy';

describe('staff warning ladder', () => {
  it('lapses a verbal warning after six months and a written one after twelve', () => {
    expect(defaultExpiry('VERBAL', '2026-09-23')).toBe('2027-03-23');
    expect(defaultExpiry('WRITTEN', '2026-09-23')).toBe('2027-09-23');
    expect(defaultExpiry('FINAL', '2026-01-31')).toBe('2027-01-31');
  });

  it('stands until withdrawn or lapsed', () => {
    expect(isWarningActive({ status: 'ACTIVE', expiresOn: '2027-03-23' }, '2026-09-23')).toBe(true);
    expect(isWarningActive({ status: 'ACTIVE', expiresOn: '2026-09-23' }, '2026-09-23')).toBe(true);
    expect(isWarningActive({ status: 'ACTIVE', expiresOn: '2026-09-22' }, '2026-09-23')).toBe(false);
    expect(isWarningActive({ status: 'ACTIVE', expiresOn: null }, '2030-01-01')).toBe(true);
    expect(isWarningActive({ status: 'WITHDRAWN', expiresOn: null }, '2026-09-23')).toBe(false);
  });

  it('points at the next rung: verbal, written, final, then dismissal', () => {
    expect(nextWarningStep([])).toBe('VERBAL');
    expect(nextWarningStep([{ level: 'VERBAL' }])).toBe('WRITTEN');
    expect(nextWarningStep([{ level: 'VERBAL' }, { level: 'WRITTEN' }])).toBe('FINAL');
    expect(nextWarningStep([{ level: 'FINAL' }])).toBe('DISMISSAL');
  });

  it('summarises per person from what still stands, highest level first', () => {
    const rows = [
      { employeeId: 5, employeeName: 'Temesgen', level: 'VERBAL', category: 'LATENESS', status: 'ACTIVE', issuedOn: '2026-09-01', expiresOn: '2027-03-01', acknowledgedAt: new Date() },
      { employeeId: 5, employeeName: 'Temesgen', level: 'WRITTEN', category: 'ABSENCE', status: 'ACTIVE', issuedOn: '2026-09-20', expiresOn: '2027-09-20', acknowledgedAt: null },
      { employeeId: 5, employeeName: 'Temesgen', level: 'FINAL', category: 'CONDUCT', status: 'WITHDRAWN', issuedOn: '2026-09-21', expiresOn: null, acknowledgedAt: null },
      { employeeId: 8, employeeName: 'Ibraahim', level: 'FINAL', category: 'CONDUCT', status: 'ACTIVE', issuedOn: '2025-01-01', expiresOn: '2026-01-01', acknowledgedAt: null },
    ];
    const out = summarizeWarnings(rows, '2026-09-23');
    expect(out).toEqual([
      { employeeId: 5, employeeName: 'Temesgen', active: 2, byLevel: { VERBAL: 1, WRITTEN: 1 }, highest: 'WRITTEN', nextStep: 'FINAL', latestIssuedOn: '2026-09-20', latestCategory: 'ABSENCE', unacknowledged: 1, withdrawn: 1 },
      // A lapsed final warning no longer stands: the ladder starts again.
      { employeeId: 8, employeeName: 'Ibraahim', active: 0, byLevel: {}, highest: null, nextStep: 'VERBAL', latestIssuedOn: null, latestCategory: null, unacknowledged: 0, withdrawn: 0 },
    ]);
  });
});
