import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

// Multer throws errors with codes like 'LIMIT_FILE_SIZE' and 'LIMIT_UNEXPECTED_FILE'.
// This filter maps common cases to friendly 400 responses.
@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>() as any;
    const log = new Logger('Upload');

    // Multer file size limit error
    if (exception?.code === 'LIMIT_FILE_SIZE') {
      log.warn(
        `File too large from ${req?.ip || 'unknown IP'}: ${exception?.message || exception}`,
      );
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'File too large',
        message: 'Please upload a file up to 50MB in size.',
      });
    }

    // Multer unexpected field or invalid file type errors can arrive with various shapes
    if (exception?.name === 'MulterError') {
      log.warn(
        `Multer error from ${req?.ip || 'unknown IP'}: ${exception?.code || exception?.message || exception}`,
      );
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Upload error',
        message:
          'There was a problem with the uploaded file. Please check the file type and try again.',
      });
    }

    // Nest ParseFilePipe errors include details; prefer a user-friendly default
    if (exception?.message?.toString?.().includes('Validation failed')) {
      log.warn(
        `Validation failed from ${req?.ip || 'unknown IP'}: ${exception?.message || exception}`,
      );
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Invalid file',
        message: 'Only images or videos are allowed. Max size is 50MB.',
      });
    }

    // Fallback: let Nest default handler process it
    throw exception;
  }
}
