import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import * as crypto from 'crypto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly noisyProbe404Paths = new Set([
    '/.env',
    '/.env.local',
    '/.env.production',
    '/.git/config',
    '/wp-admin',
    '/wp-login.php',
    '/xmlrpc.php',
    '/phpinfo.php',
  ]);

  private headerValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
  }

  private fingerprintValue(value: unknown): string | null {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (!normalized) {
      return null;
    }

    return crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 16);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    // If the request is already aborted, do not attempt any writes
    if ((request as any)?.aborted) {
      return;
    }
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const responseBody =
      exception instanceof HttpException ? exception.getResponse() : exception;
    let code = 'INTERNAL_ERROR';
    let message =
      typeof responseBody === 'string'
        ? responseBody
        : (responseBody as any)?.message || 'Unknown error';
    let details: any = undefined;
    if (typeof responseBody === 'object' && responseBody) {
      code = (responseBody as any).code || code;
      details = (responseBody as any).details;
      if (Array.isArray((responseBody as any).message)) {
        // Nest validation often returns an array of messages
        message = (responseBody as any).message.join('; ');
      }
    }

    const path = (request.path || request.url || '').split('?')[0];
    const userAgent = this.headerValue(request.headers['user-agent']);
    const forwardedFor = this.headerValue(request.headers['x-forwarded-for']);
    const clientIp = (forwardedFor.split(',')[0] || request.ip || '').trim();
    const isExpectedAuthVerifyProbe =
      status === 401 && request.method === 'GET' && path === '/api/auth/verify';
    const isExpected404Probe =
      status === 404 &&
      request.method === 'GET' &&
      (this.noisyProbe404Paths.has(path) || path.startsWith('/.well-known/'));
    const isExpectedPaymentDecline =
      status === 402 && code === 'PAYMENT_DECLINED';
    const isExpectedDuplicateRequestOffer =
      status === 400 &&
      request.method === 'POST' &&
      /^\/api\/product-requests\/\d+\/offers$/.test(path) &&
      typeof message === 'string' &&
      message.includes(
        'You already have an active offer for this request. Update or withdraw it instead.',
      );
    const isExpectedDuplicateRegistration =
      status === 409 &&
      request.method === 'POST' &&
      path === '/api/auth/register' &&
      typeof message === 'string' &&
      message.includes('Email already in use');
    const paymentDeclineProviderCode =
      isExpectedPaymentDecline && details
        ? String(details?.providerCode || '')
        : '';
    const paymentDeclineTelemetryTagFromDetails =
      isExpectedPaymentDecline && details
        ? String(details?.telemetryTag || '')
        : '';
    const paymentDeclineTelemetryTag =
      paymentDeclineTelemetryTagFromDetails ||
      (paymentDeclineProviderCode === '5310'
        ? 'EBIRR_EXPECTED_DECLINE_5310_USER_REJECTED'
        : paymentDeclineProviderCode === '5309'
          ? 'EBIRR_EXPECTED_DECLINE_5309_INSUFFICIENT_BALANCE'
          : 'PAYMENT_EXPECTED_DECLINE');

    // Reduce noise for expected denials (401/403), conflicts (409), 404s, rate limits (429), and expected payment declines (402)
    if (
      status === 401 ||
      status === 403 ||
      status === 409 ||
      status === 404 ||
      status === 429 ||
      isExpectedPaymentDecline ||
      isExpectedDuplicateRequestOffer
    ) {
      const msg = `${
        status === 404
          ? 'Not Found'
          : status === 409
            ? 'Conflict'
            : status === 429
              ? 'Rate limited'
              : isExpectedPaymentDecline
                ? 'Payment declined'
                : isExpectedDuplicateRequestOffer
                  ? 'Business-rule rejection'
                  : 'Auth denial'
      } ${status} on ${request.method} ${request.url}: ${
        typeof message === 'string' ? message : JSON.stringify(message)
      }`;
      if (isExpectedAuthVerifyProbe) {
        this.logger.debug(
          `Expected auth check ${status} on ${request.method} ${path} ua="${userAgent || 'unknown'}" ip="${clientIp || 'unknown'}"`,
        );
      } else if (isExpected404Probe) {
        this.logger.debug(
          `Expected probe miss ${status} on ${request.method} ${path} ua="${userAgent || 'unknown'}" ip="${clientIp || 'unknown'}"`,
        );
      } else if (status === 429) {
        this.logger.debug(msg);
      } else if (isExpectedPaymentDecline) {
        this.logger.warn(
          `${msg} telemetryTag="${paymentDeclineTelemetryTag}" details=${JSON.stringify(details || {})} ua="${userAgent || 'unknown'}" ip="${clientIp || 'unknown'}"`,
        );
      } else if (isExpectedDuplicateRegistration) {
        const emailHash = this.fingerprintValue(request.body?.email);
        const ipFingerprint = this.fingerprintValue(clientIp);
        this.logger.warn(
          `Duplicate registration attempt status=${status} method=${request.method} path=${path} emailHash="${emailHash || 'unknown'}" ipFingerprint="${ipFingerprint || 'unknown'}" ua="${userAgent || 'unknown'}"`,
        );
      } else if (isExpectedDuplicateRequestOffer) {
        this.logger.warn(msg);
      } else {
        this.logger.warn(msg);
      }
    } else {
      this.logger.error(
        `Exception on ${request.method} ${request.url}:`,
        exception instanceof Error
          ? exception.stack
          : JSON.stringify(exception),
      );
      // Report 5xx to Sentry if configured
      try {
        if (status >= 500 && process.env.SENTRY_DSN) {
          Sentry.captureException(
            exception instanceof Error ? exception : new Error(String(message)),
          );
        }
      } catch (err) {
        this.logger.debug('Sentry capture failed', err as Error);
      }
    }

    // If headers already sent or stream already ended/finished, don't attempt to write again
    const resAny = response as any;
    const headersAlreadySent = !!resAny.headersSent;
    const streamEnded = !!resAny.writableEnded || !!resAny.writableFinished;
    if (headersAlreadySent || streamEnded) {
      // Best-effort: close the connection if not already ended
      try {
        if (!streamEnded && typeof resAny.end === 'function') {
          resAny.end();
        }
      } catch (err) {
        this.logger.debug(
          'Failed to end response after headers sent',
          err as Error,
        );
      }
      return;
    }

    response.status(status).json({
      error: {
        code,
        message,
        details,
      },
    });
  }
}
