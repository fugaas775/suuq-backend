import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosBranchSecurity } from './entities/pos-branch-security.entity';

@Injectable()
export class PosSessionRevocationService {
  constructor(
    @InjectRepository(PosBranchSecurity)
    private readonly securityRepo: Repository<PosBranchSecurity>,
  ) {}

  /**
   * Returns true if the token (identified by its iat in seconds) is still valid
   * for the given branch. Returns false if a branch-wide revocation was issued
   * after the token was minted.
   */
  async isOperatorTokenValid(
    branchId: number,
    tokenIatSeconds: number,
  ): Promise<boolean> {
    const record = await this.securityRepo.findOne({ where: { branchId } });
    if (!record?.operatorSessionsRevokedAt) {
      return true; // no revocation on record
    }
    const tokenIssuedAtMs = tokenIatSeconds * 1000;
    return tokenIssuedAtMs >= record.operatorSessionsRevokedAt.getTime();
  }

  /**
   * Revokes all operator sessions for a branch by recording the current timestamp.
   * Any pos_operator token with iat before now will be rejected on next use.
   */
  async revokeAllOperatorSessions(branchId: number): Promise<void> {
    await this.securityRepo.upsert(
      { branchId, operatorSessionsRevokedAt: new Date() },
      { conflictPaths: ['branchId'] },
    );
  }
}
