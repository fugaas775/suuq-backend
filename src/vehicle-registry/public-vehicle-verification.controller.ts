import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
  renderVehicleFormPage,
  renderVehicleResultPage,
} from './public-vehicle-verification.page';
import { PublicVehicleVerificationService } from './public-vehicle-verification.service';
import { resolvePublicKeyPem } from './certificate-signing';

/**
 * What the QR on a registration certificate points at.
 *
 * Unauthenticated by design: the reader is a traffic officer at a checkpoint or
 * someone buying a used car, neither of whom has an account, and requiring one
 * would mean the QR is only useful to people who already have the answer.
 *
 * Two ways in, because a certificate can be damaged and a car cannot:
 *   /vr/<code>   the QR target — the token from the certificate
 *   /vr/?plate=  typed off the bumper, when there is no certificate at all
 *
 * A miss answers 200 with the "no record" card rather than 404. Someone
 * scanning a plate that predates this registry deserves an explanation, not a
 * browser error page — and a 404 reads as "the system is broken" to a person
 * standing at a roadside.
 */
@ApiTags('public')
@Controller('public/vehicles')
// Tighter than the platform default. Plate numbers are sequential and written
// on the outside of every car, so this endpoint is inherently enumerable — the
// real defence is that the payload carries nothing personal (see the service),
// but there is no reason to make bulk scraping comfortable.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicVehicleVerificationController {
  constructor(
    private readonly verification: PublicVehicleVerificationService,
  ) {}

  /** The form, and the typed-plate lookup that submits to it. */
  @Public()
  @Get('page')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  async formPage(@Query('plate') plate?: string) {
    if (!plate || !plate.trim()) {
      return renderVehicleFormPage(null);
    }
    return renderVehicleResultPage(
      await this.verification.verifyByPlate(plate),
    );
  }

  /** The QR target. */
  @Public()
  @Get('page/:code')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  async resultPage(
    @Param('code') code: string,
    @Query('plate') plate?: string,
  ) {
    // A plate typed into the form on a result page wins over the code in the
    // path — otherwise the second lookup silently returns the first vehicle.
    if (plate && plate.trim()) {
      return renderVehicleResultPage(
        await this.verification.verifyByPlate(plate),
      );
    }
    return renderVehicleResultPage(
      await this.verification.verifyByCode(code),
    );
  }

  /**
   * The Bureau's public signing key, so an officer's device can verify a
   * certificate with no network.
   *
   * Public by definition — a verification key is worthless as a secret, and the
   * whole point is that anyone can check the Bureau's signature. Cached hard:
   * it changes only on key rotation, and a device that fetched it once should
   * keep working through the outage it is meant to survive.
   */
  @Public()
  @Get('keys')
  @Header('Cache-Control', 'public, max-age=86400')
  async publicKeys() {
    const pem = resolvePublicKeyPem();
    return {
      keys: pem
        ? [
            {
              kid: Number(process.env.VEHICLE_REGISTRY_SIGNING_KID || 1) || 1,
              alg: 'Ed25519',
              publicKeyPem: pem,
            },
          ]
        : [],
      // Said plainly rather than implied by an empty array: offline
      // verification is simply unavailable until a key is configured.
      offlineVerificationAvailable: Boolean(pem),
    };
  }

  /** The same answer as JSON, for anything programmatic. */
  @Public()
  @Get(':code')
  @Header('Cache-Control', 'no-store')
  async resultJson(@Param('code') code: string) {
    return this.verification.verifyByCode(code);
  }
}
