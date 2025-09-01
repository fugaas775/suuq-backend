import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  // This method is called by passport after it verifies the token's signature.
  // It decodes the payload and returns it. NestJS then automatically
  // attaches this returned object to the `request.user` property.
  async validate(payload: any) {
    // The payload is trusted. Directly return the expected structure.
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles, // Assumes roles is already an array in the JWT
    };
  }
}
