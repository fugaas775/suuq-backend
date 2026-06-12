import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlAccount } from './entities/gl-account.entity';
import { GlJournalEntry } from './entities/gl-journal-entry.entity';
import { GlJournalLine } from './entities/gl-journal-line.entity';
import { GeneralLedgerService } from './general-ledger.service';
import { LedgerStatementsService } from './ledger-statements.service';

/**
 * General-ledger foundation. Owns the chart of accounts and the journal, and
 * exposes GeneralLedgerService so other modules (pos-sync, billing,
 * property-rental, hospitality) can post balanced entries as financial events
 * occur.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GlAccount, GlJournalEntry, GlJournalLine]),
  ],
  providers: [GeneralLedgerService, LedgerStatementsService],
  exports: [GeneralLedgerService, LedgerStatementsService],
})
export class AccountingModule {}
