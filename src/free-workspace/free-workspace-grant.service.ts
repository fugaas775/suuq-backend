import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  AccountFreeWorkspaceGrant,
  FreeWorkspaceGrantKind,
} from './entities/account-free-workspace-grant.entity';

export interface ClaimFreeWorkspaceInput {
  kind: FreeWorkspaceGrantKind;
  planCode: string;
  endsAt: Date | null;
  branchId?: number | null;
  retailTenantId?: number | null;
  supplierProfileId?: number | null;
  metadata?: Record<string, any> | null;
}

/**
 * Hands out the one free workspace an account ever gets.
 *
 * Every path that opens a workspace without payment — the auto-provisioned
 * branch a first Google sign-in lands in, a branch created by hand at the gate,
 * a supplier account — goes through `claim()`. It is the only place that may
 * decide an account owes nothing, so "one free per Google account" is one rule
 * in one file rather than a condition repeated at three call sites that drift.
 *
 * The check is not "does this account already have a workspace?" — that answer
 * changes when a branch is deleted, and an owner who deleted theirs would be
 * handed a fresh free one. It is "has this account ever been given one?", which
 * is what the grant row records.
 */
@Injectable()
export class FreeWorkspaceGrantService {
  private readonly logger = new Logger(FreeWorkspaceGrantService.name);

  constructor(
    @InjectRepository(AccountFreeWorkspaceGrant)
    private readonly grantsRepository: Repository<AccountFreeWorkspaceGrant>,
  ) {}

  /** The account's live grant, or null when its slot is still open. */
  async findActiveGrant(
    userId: number,
  ): Promise<AccountFreeWorkspaceGrant | null> {
    if (!Number.isFinite(userId) || userId <= 0) {
      return null;
    }

    return this.grantsRepository.findOne({
      where: { userId, releasedAt: IsNull() },
    });
  }

  /** Has this account already spent its one free workspace? */
  async hasClaimedFreeWorkspace(userId: number): Promise<boolean> {
    return (await this.findActiveGrant(userId)) != null;
  }

  /**
   * Spend the account's free workspace on this branch / supplier.
   *
   * Returns the grant when the slot was still open (or was already spent on
   * THIS same workspace — re-running onboarding must not fail), and null when
   * the account has already spent it on something else. A null answer means
   * "this workspace is chargeable", never "something went wrong".
   *
   * The insert is `ON CONFLICT DO NOTHING` against a unique index rather than a
   * read-then-write: two tabs finishing signup at the same moment would both
   * see an open slot and both grant one. The database settles it.
   */
  async claim(
    userId: number,
    input: ClaimFreeWorkspaceInput,
  ): Promise<AccountFreeWorkspaceGrant | null> {
    if (!Number.isFinite(userId) || userId <= 0) {
      return null;
    }

    const inserted = await this.grantsRepository
      .createQueryBuilder()
      .insert()
      .into(AccountFreeWorkspaceGrant)
      .values({
        userId,
        kind: input.kind,
        planCode: input.planCode,
        endsAt: input.endsAt ?? null,
        branchId: input.branchId ?? null,
        retailTenantId: input.retailTenantId ?? null,
        supplierProfileId: input.supplierProfileId ?? null,
        grantedAt: new Date(),
        metadata: input.metadata ?? null,
      })
      .orIgnore()
      .returning('*')
      .execute();

    const row = inserted.raw?.[0] ?? null;
    if (row) {
      this.logger.log(
        `Free workspace granted to user #${userId} (${input.kind} ` +
          `#${input.branchId ?? input.supplierProfileId ?? '?'}).`,
      );
      return row as AccountFreeWorkspaceGrant;
    }

    // The insert was refused, so the account already holds a grant. It is only
    // reusable when it was spent on this very workspace — otherwise this one is
    // the account's second, and second workspaces are paid for.
    const existing = await this.findActiveGrant(userId);
    if (!existing) {
      return null;
    }

    const sameWorkspace =
      (input.branchId != null && existing.branchId === input.branchId) ||
      (input.supplierProfileId != null &&
        existing.supplierProfileId === input.supplierProfileId);

    return sameWorkspace ? existing : null;
  }

  /**
   * Give the account its slot back. Support-only: a workspace opened by mistake
   * or a goodwill call. The released row stays for the audit trail.
   */
  async release(
    userId: number,
    reason: string,
  ): Promise<AccountFreeWorkspaceGrant | null> {
    const grant = await this.findActiveGrant(userId);
    if (!grant) {
      return null;
    }

    grant.releasedAt = new Date();
    grant.releasedReason = reason?.trim()?.slice(0, 255) || null;
    const saved = await this.grantsRepository.save(grant);
    this.logger.log(
      `Free workspace slot released for user #${userId}: ${grant.releasedReason ?? 'no reason given'}`,
    );
    return saved;
  }
}
