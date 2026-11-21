import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BranchesService } from './branches.service';

/**
 * Keeps complimentary branches (100 % subscription discount) covered without
 * anyone having to remember them. Runs a little before midnight's lifecycle
 * pass, so a branch is renewed before that pass could expire or remind it.
 */
@Injectable()
export class BranchComplimentaryRenewalService {
  private readonly logger = new Logger(BranchComplimentaryRenewalService.name);

  constructor(private readonly branchesService: BranchesService) {}

  @Cron('0 30 23 * * *')
  async handle(): Promise<void> {
    try {
      const renewed = await this.branchesService.renewComplimentaryBranches();
      if (renewed) {
        this.logger.log(`Renewed ${renewed} complimentary branch term(s).`);
      }
    } catch (error) {
      this.logger.error('Complimentary renewal pass failed', error as Error);
    }
  }
}
