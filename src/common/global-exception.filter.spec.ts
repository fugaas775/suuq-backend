import { ConflictException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { QueryFailedError } from 'typeorm';
import { GlobalExceptionFilter } from './global-exception.filter';

jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

function run(exception: unknown, method = 'PATCH', url = '/api/x') {
  const filter = new GlobalExceptionFilter();
  // Silence the filter's own logging in the test output.
  (filter as any).logger = {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const sent: { status?: number; body?: any } = {};
  const response: any = {
    headersSent: false,
    status: (code: number) => {
      sent.status = code;
      return response;
    },
    json: (body: any) => {
      sent.body = body;
      return response;
    },
  };
  const request: any = { method, url, path: url, headers: {}, ip: '1.2.3.4' };
  const host: any = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
  filter.catch(exception, host);
  return { sent, logger: (filter as any).logger };
}

describe('GlobalExceptionFilter', () => {
  const OLD_DSN = process.env.SENTRY_DSN;
  beforeEach(() => {
    process.env.SENTRY_DSN = 'https://example.invalid/1';
    (Sentry.captureException as jest.Mock).mockClear();
  });
  afterAll(() => {
    process.env.SENTRY_DSN = OLD_DSN;
  });

  it('answers a unique-index refusal as 409 DUPLICATE, not a 500, and pages nobody', () => {
    const err = new QueryFailedError(
      'INSERT INTO "pos_school_lesson_plans" ...',
      [],
      Object.assign(
        new Error('duplicate key value violates unique constraint'),
        {
          code: '23505',
        },
      ),
    );
    const { sent, logger } = run(err);
    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      error: {
        code: 'DUPLICATE',
        message: 'That was already saved — refresh to see it.',
        details: undefined,
      },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('still reports any other database failure as a 500', () => {
    const err = new QueryFailedError(
      'SELECT 1',
      [],
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );
    const { sent } = run(err);
    expect(sent.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('serialises a coded ConflictException with its details — the FOLIO_CHANGED shape the till reads', () => {
    const current = { id: 7, updatedAt: '2026-09-22T08:00:00.000Z' };
    const { sent } = run(
      new ConflictException({
        code: 'FOLIO_CHANGED',
        message: 'This record changed since it was read.',
        details: { current },
      }),
    );
    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      error: {
        code: 'FOLIO_CHANGED',
        message: 'This record changed since it was read.',
        details: { current },
      },
    });
  });
});
