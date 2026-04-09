import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { normalizeActionResponsePaths } from '../utils/action-path-normalizer';

@Injectable()
export class ActionPathNormalizationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(map((data) => normalizeActionResponsePaths(data)));
  }
}
