import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import {
  RECEIPT_VERIFICATION_CODE_ALPHABET,
  RECEIPT_VERIFICATION_CODE_LENGTH,
  formatReceiptVerificationCode,
} from '../pos-sync/receipt-verification-code';
import { SchoolStatementCode } from './entities/school-statement-code.entity';

/** A fresh token in the receipt's own alphabet — server-minted, since the statement is. */
export function mintStatementCode(): string {
  const bytes = randomBytes(RECEIPT_VERIFICATION_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < RECEIPT_VERIFICATION_CODE_LENGTH; i += 1) {
    code +=
      RECEIPT_VERIFICATION_CODE_ALPHABET[
        bytes[i] % RECEIPT_VERIFICATION_CODE_ALPHABET.length
      ];
  }
  return code;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof QueryFailedError &&
  String(
    (err as { driverError?: { code?: unknown } }).driverError?.code ??
      (err as { code?: unknown }).code,
  ) === '23505';

/**
 * One token per pupil, minted on first use and kept for good. Two readers
 * racing to mint for the same child: the loser hits the folio's unique
 * constraint and reads the winner's row.
 */
@Injectable()
export class SchoolStatementCodeService {
  constructor(
    @InjectRepository(SchoolStatementCode)
    private readonly codes: Repository<SchoolStatementCode>,
  ) {}

  async codeFor(
    branchId: number,
    folioId: number,
  ): Promise<{ code: string; displayCode: string }> {
    const existing = await this.codes.findOne({ where: { folioId } });
    if (existing)
      return {
        code: existing.code,
        displayCode: formatReceiptVerificationCode(existing.code),
      };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const saved = await this.codes.save(
          this.codes.create({ branchId, folioId, code: mintStatementCode() }),
        );
        return {
          code: saved.code,
          displayCode: formatReceiptVerificationCode(saved.code),
        };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const won = await this.codes.findOne({ where: { folioId } });
        if (won)
          return {
            code: won.code,
            displayCode: formatReceiptVerificationCode(won.code),
          };
        // A code collision (70 bits — theoretical): mint again.
      }
    }
    throw new Error('Could not mint a statement code.');
  }
}
