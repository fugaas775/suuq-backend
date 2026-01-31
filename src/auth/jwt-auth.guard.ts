import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info && info.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Unauthorized',
          error: 'TokenExpired', // Specific code for the frontend
        });
      }
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
