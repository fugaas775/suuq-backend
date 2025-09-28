import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

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

  // Reduce noise for expected denials (401/403), 404s, and rate limits (429): log as warn with concise message
  if (status === 401 || status === 403 || status === 404 || status === 429) {
      const msg = `${status === 404 ? 'Not Found' : status === 429 ? 'Rate limited' : 'Auth denial'} ${status} on ${request.method} ${request.url}: ${
          typeof message === 'string' ? message : JSON.stringify(message)
        }`;
      if (status === 429) {
        this.logger.debug(msg);
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
      } catch {}
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
