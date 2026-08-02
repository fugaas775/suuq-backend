import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HotelFolioService } from './hotel-folio.service';
import { HotelFolioStatus } from './entities/hotel-folio.entity';
import { GlAccountCode } from '../accounting/gl-accounts.constant';

/**
 * Partial payments on a HOTEL folio.
 *
 * Before recordPayment existed, the POS had no way to report an instalment to the
 * backend at all: the only write path was settleFolio, which flips the folio to
 * SETTLED unconditionally (the Muntaha Room 210 incident), so the frontend
 * deliberately skipped it on the partial branch. Two consequences, both fixed here:
 *
 *   1. folio.paidAmount only ever reflected the FINAL payment.
 *   2. settleFolio books `receivable = recognised - paid`, so every
 *      instalment-settled folio posted phantom accounts receivable equal to the
 *      instalments collected earlier.
 */
describe('HotelFolioService — partial payments', () => {
  let service: HotelFolioService;
  let folioRepo: { findOne: jest.Mock; save: jest.Mock };
  let chargeRepo: { find: jest.Mock };
  let roomRepo: { findOne: jest.Mock; save: jest.Mock };
  let generalLedger: { post: jest.Mock };

  const openFolio = (over: Record<string, unknown> = {}) => ({
    id: 91,
    branchId: 4,
    status: HotelFolioStatus.OPEN,
    roomNumber: '210',
    currency: 'ETB',
    chargesTotal: 17500,
    paidAmount: null,
    payments: null,
    // toFolioResponse serializes these, so every fixture needs them.
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    updatedAt: new Date('2026-06-01T08:00:00.000Z'),
    settledAt: null,
    voidedAt: null,
    ...over,
  });

  beforeEach(() => {
    folioRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => ({
        createdAt: new Date('2026-06-01T08:00:00.000Z'),
        updatedAt: new Date('2026-06-01T08:00:00.000Z'),
        ...value,
      })),
    };
    chargeRepo = { find: jest.fn(async () => []) };
    roomRepo = { findOne: jest.fn(), save: jest.fn() };
    generalLedger = { post: jest.fn(async () => undefined) };
    service = new HotelFolioService(
      folioRepo as never,
      chargeRepo as never,
      roomRepo as never,
      generalLedger as never,
    );
  });

  describe('recordPayment', () => {
    it('accrues paidAmount and leaves the folio OPEN', async () => {
      folioRepo.findOne.mockResolvedValue(openFolio());

      await service.recordPayment(91, {
        amount: 7500,
        paymentMethod: 'CASH',
        idempotencyKey: 'folio-pay-91-POS-1-482',
      });

      const saved = folioRepo.save.mock.calls[0][0];
      expect(saved.paidAmount).toBe(7500);
      expect(saved.status).toBe(HotelFolioStatus.OPEN);
      expect(saved.payments).toHaveLength(1);
      expect(saved.payments[0]).toMatchObject({
        amount: 7500,
        method: 'CASH',
        currency: 'ETB',
      });
    });

    it('adds a second instalment on top of the first', async () => {
      folioRepo.findOne.mockResolvedValue(
        openFolio({
          paidAmount: 7500,
          payments: [
            {
              amount: 7500,
              method: 'CASH',
              currency: 'ETB',
              reference: null,
              checkoutId: null,
              idempotencyKey: 'first',
              paidAt: '2026-06-01T08:00:00.000Z',
            },
          ],
        }),
      );

      await service.recordPayment(91, {
        amount: 2500,
        idempotencyKey: 'second',
      });

      const saved = folioRepo.save.mock.calls[0][0];
      expect(saved.paidAmount).toBe(10000);
      expect(saved.payments).toHaveLength(2);
    });

    it('is idempotent on a repeated idempotencyKey', async () => {
      // The mirror call retries on failure, so a retry landing after a slow
      // success must not double the amount.
      folioRepo.findOne.mockResolvedValue(
        openFolio({
          paidAmount: 7500,
          payments: [
            {
              amount: 7500,
              method: 'CASH',
              currency: 'ETB',
              reference: null,
              checkoutId: null,
              idempotencyKey: 'dup-key',
              paidAt: '2026-06-01T08:00:00.000Z',
            },
          ],
        }),
      );

      await service.recordPayment(91, {
        amount: 7500,
        idempotencyKey: 'dup-key',
      });

      expect(folioRepo.save).not.toHaveBeenCalled();
    });

    it('sums a split-tender payment', async () => {
      folioRepo.findOne.mockResolvedValue(openFolio());

      await service.recordPayment(91, {
        payments: [
          { method: 'CASH', amount: 5000 },
          { method: 'MOBILE_MONEY', amount: 2500 },
        ],
        idempotencyKey: 'split',
      });

      expect(folioRepo.save.mock.calls[0][0].paidAmount).toBe(7500);
    });

    it('rejects a payment against a SETTLED folio', async () => {
      folioRepo.findOne.mockResolvedValue(
        openFolio({ status: HotelFolioStatus.SETTLED }),
      );
      await expect(
        service.recordPayment(91, { amount: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a zero or negative amount', async () => {
      folioRepo.findOne.mockResolvedValue(openFolio());
      await expect(
        service.recordPayment(91, { amount: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown folio', async () => {
      folioRepo.findOne.mockResolvedValue(null);
      await expect(
        service.recordPayment(91, { amount: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('posts NO general-ledger entry', async () => {
      // The instalment's cash is already recognised through the POS checkout
      // ingestion path, and settleFolio credits SERVICE_REVENUE for the charges.
      // A third posting here would double-book.
      folioRepo.findOne.mockResolvedValue(openFolio());
      await service.recordPayment(91, { amount: 7500, idempotencyKey: 'k' });
      expect(generalLedger.post).not.toHaveBeenCalled();
    });
  });

  describe('settleFolio', () => {
    it('ADDS the final tender to prior instalments', async () => {
      // 7,500 recorded, then settled with 10,000. Before this fix the folio
      // ended up reading 10,000 — the earlier instalment simply vanished.
      folioRepo.findOne.mockResolvedValue(
        openFolio({
          paidAmount: 7500,
          payments: [
            {
              amount: 7500,
              method: 'CASH',
              currency: 'ETB',
              reference: null,
              checkoutId: null,
              idempotencyKey: 'first',
              paidAt: '2026-06-01T08:00:00.000Z',
            },
          ],
        }),
      );

      await service.settleFolio(91, {
        payments: [{ method: 'CASH', amount: 10000 }],
        confirmed: true,
      } as never);

      const saved = folioRepo.save.mock.calls[0][0];
      expect(saved.paidAmount).toBe(17500);
      expect(saved.status).toBe(HotelFolioStatus.SETTLED);
    });

    it('books no ACCOUNTS_RECEIVABLE on a fully instalment-paid folio', async () => {
      // charges 17,500 = 7,500 recorded + 10,000 at settle. Nothing is owed, so
      // no receivable should be posted. It used to post 7,500 of phantom A/R.
      folioRepo.findOne.mockResolvedValue(
        openFolio({
          chargesTotal: 17500,
          paidAmount: 7500,
          payments: [
            {
              amount: 7500,
              method: 'CASH',
              currency: 'ETB',
              reference: null,
              checkoutId: null,
              idempotencyKey: 'first',
              paidAt: '2026-06-01T08:00:00.000Z',
            },
          ],
        }),
      );

      await service.settleFolio(91, {
        payments: [{ method: 'CASH', amount: 10000 }],
        confirmed: true,
      } as never);

      expect(generalLedger.post).toHaveBeenCalled();
      const journal = generalLedger.post.mock.calls[0][0];
      const lines = journal.lines || journal;
      const receivable = (lines as { accountCode: string }[]).find(
        (l) => l.accountCode === GlAccountCode.ACCOUNTS_RECEIVABLE,
      );
      expect(receivable).toBeUndefined();
    });

    it('still books a receivable when the folio really is short-paid', async () => {
      // charges 17,500, only 10,000 ever collected → 7,500 genuinely owed.
      folioRepo.findOne.mockResolvedValue(openFolio({ chargesTotal: 17500 }));

      await service.settleFolio(91, {
        payments: [{ method: 'CASH', amount: 10000 }],
        confirmed: true,
      } as never);

      const journal = generalLedger.post.mock.calls[0][0];
      const lines = journal.lines || journal;
      const receivable = (
        lines as { accountCode: string; debit?: number }[]
      ).find((l) => l.accountCode === GlAccountCode.ACCOUNTS_RECEIVABLE);
      expect(receivable?.debit).toBe(7500);
    });

    it('is idempotent on an already-SETTLED folio', async () => {
      folioRepo.findOne.mockResolvedValue(
        openFolio({ status: HotelFolioStatus.SETTLED, paidAmount: 17500 }),
      );
      await service.settleFolio(91, {
        payments: [{ method: 'CASH', amount: 10000 }],
      });
      expect(folioRepo.save).not.toHaveBeenCalled();
    });
  });
});
