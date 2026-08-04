import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PublicReceiptVerificationService } from './public-receipt-verification.service';

/**
 * Public receipt verification — the endpoint behind the QR code printed on
 * every POS receipt.
 *
 * Unauthenticated by design: the audience is a customer holding a printed
 * receipt, who scans it to confirm the sale exists on our books with the total
 * the paper claims. The token is the only credential, which is why it is 70
 * random bits and why the payload stays thin (see the service).
 *
 * An unknown token answers 200 with `{ found: false }` rather than 404: a
 * customer who scans a receipt from before this shipped, or one whose sale is
 * still stuck in a device outbox, should get our "no record" card explaining
 * what that means — not a browser error page.
 */
@ApiTags('public')
@Controller('public/receipts')
export class PublicReceiptVerificationController {
  constructor(
    private readonly verificationService: PublicReceiptVerificationService,
  ) {}

  @Public()
  // Tighter than the global default: this route is reachable without a
  // credential, and the tokens are the only thing standing between a scraper
  // and a list of real sales.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':code')
  @ApiOperation({ summary: 'Verify a printed POS receipt by its QR token' })
  verify(@Param('code') code: string) {
    return this.verificationService.verify(code);
  }
}
