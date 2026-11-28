import { Logger } from '@nestjs/common';
import {
  ClientTelemetryController,
  sanitizeClientTelemetry,
} from './client-telemetry.controller';

describe('client telemetry', () => {
  it('keeps the named fields of an error report', () => {
    const out = sanitizeClientTelemetry({
      type: 'error',
      kind: 'panel',
      where: 'drawer-tab:folios',
      name: 'ReferenceError',
      message: 'simpleMode is not defined',
      build: 'aa5e1ae-x',
      branchId: 142,
      serviceFormat: 'QSR',
      online: true,
    });
    expect(out).toEqual({
      type: 'error',
      kind: 'panel',
      where: 'drawer-tab:folios',
      name: 'ReferenceError',
      message: 'simpleMode is not defined',
      build: 'aa5e1ae-x',
      branchId: 142,
      serviceFormat: 'QSR',
      online: true,
    });
  });

  it('drops anything it was not told about, and anything that is not a short scalar', () => {
    const out = sanitizeClientTelemetry({
      type: 'error',
      message: 'boom',
      token: 'eyJ-secret',
      user: { email: 'someone@example.com' },
      where: { nested: true },
      branchId: '142; DROP',
    });
    expect(out).toEqual({ type: 'error', message: 'boom' });
  });

  it('cannot forge a second log line or an oversized one', () => {
    const out = sanitizeClientTelemetry({
      type: 'error',
      message: `first\n[Nest] 1 - ERROR forged\r\n${'x'.repeat(5000)}`,
    });
    expect(String(out?.message)).not.toMatch(/[\r\n]/);
    expect(String(out?.message).length).toBeLessThanOrEqual(601);
  });

  it('accepts a metric and rejects everything shapeless', () => {
    expect(
      sanitizeClientTelemetry({ type: 'metric', name: 'INP', value: 184.5 }),
    ).toEqual({ type: 'metric', name: 'INP', value: 184.5 });
    expect(sanitizeClientTelemetry({ type: 'metric', name: 'INP' })).toBeNull();
    expect(sanitizeClientTelemetry({ type: 'error' })).toBeNull();
    expect(sanitizeClientTelemetry({ type: 'other', message: 'x' })).toBeNull();
    expect(sanitizeClientTelemetry('text')).toBeNull();
    expect(sanitizeClientTelemetry(null)).toBeNull();
    expect(sanitizeClientTelemetry([])).toBeNull();
  });

  it('logs an error as a warning, a metric as a log line, and garbage not at all', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const controller = new ClientTelemetryController();
    controller.report({ type: 'error', message: 'boom' });
    controller.report({ type: 'metric', name: 'LCP', value: 900 });
    controller.report({ nonsense: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe('{"type":"error","message":"boom"}');
    warn.mockRestore();
    log.mockRestore();
  });
});
