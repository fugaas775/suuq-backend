import {
  SubscriptionPaymentMailerService,
  renderBillingEmail,
} from './subscription-payment-mailer.service';

function createMailer() {
  const emailService = { send: jest.fn().mockResolvedValue(undefined) };
  const usersRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 9, email: 'owner@suuq.test' }),
  };
  const branchesRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 21, name: 'Bole Flagship' }),
  };
  const mailer = new SubscriptionPaymentMailerService(
    emailService as any,
    usersRepo as any,
    branchesRepo as any,
  );
  return { mailer, emailService, usersRepo };
}

const claim: any = {
  id: 5,
  referenceId: 'POSACT-21-1790000000000-MONTHLY',
  kind: 'POS_BRANCH',
  status: 'SUBMITTED',
  userId: 9,
  branchId: 21,
  subjectName: 'Bole Flagship',
  periodMonths: 1,
  amount: 3900,
  currency: 'ETB',
  channel: 'CBE',
  payerReference: 'FT24123ABCD',
  receiptUrl: 'https://cdn.example/receipt.jpg',
};

describe('SubscriptionPaymentMailerService', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('tells the admins there is a payment to verify, and the customer that we have it', async () => {
    process.env.BILLING_ADMIN_EMAILS = 'billing@suuq.test, Owner@Suuq.test';
    const { mailer, emailService } = createMailer();

    await mailer.paymentSubmitted(claim);

    const sent = emailService.send.mock.calls.map(([mail]) => mail);
    expect(sent.map((mail) => mail.to)).toEqual([
      'billing@suuq.test',
      'owner@suuq.test',
      'owner@suuq.test',
    ]);
    // The admin mail carries what is needed to check the account.
    expect(sent[0].subject).toContain('Payment to verify');
    expect(sent[0].text).toContain('FT24123ABCD');
    expect(sent[0].text).toContain('1000285447578');
    expect(sent[0].text).toContain('https://cdn.example/receipt.jpg');
    expect(sent[0].text).toContain('/payments');
    // The customer mail promises nothing has to be done.
    expect(sent[2].subject).toContain('We received your payment details');
  });

  it('falls back to the super admins when no billing address is configured', () => {
    delete process.env.BILLING_ADMIN_EMAILS;
    process.env.SUPER_ADMIN_EMAILS = 'root@suuq.test;not-an-email';
    expect(createMailer().mailer.adminRecipients()).toEqual(['root@suuq.test']);
  });

  it('shows the customer why a payment was rejected', async () => {
    const { mailer, emailService } = createMailer();
    await mailer.paymentRejected({
      ...claim,
      status: 'REJECTED',
      reviewNote: 'No transfer with this number on the CBE statement.',
    });
    expect(emailService.send.mock.calls[0][0].text).toContain(
      'No transfer with this number on the CBE statement.',
    );
  });

  it('does not send a second "verified" email when the receipt already went', async () => {
    const { mailer, emailService } = createMailer();
    await mailer.paymentApproved(claim, { receiptAlreadySent: true });
    expect(emailService.send).not.toHaveBeenCalled();
    await mailer.paymentApproved({ ...claim, kind: 'SUPPLIER' });
    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it('names the branch in the reminder and the term-ended email', async () => {
    const { mailer, emailService } = createMailer();
    await mailer.renewalDue({
      ownerUserId: 9,
      branchId: 21,
      endsAt: new Date('2026-12-01T00:00:00.000Z'),
      daysLeft: 3,
    });
    await mailer.termEnded({
      ownerUserId: 9,
      branchId: 21,
      endsAt: new Date('2026-12-01T00:00:00.000Z'),
      graceEndsAt: new Date('2026-12-04T00:00:00.000Z'),
    });
    const [reminder, ended] = emailService.send.mock.calls.map(([m]) => m);
    expect(reminder.subject).toContain('Bole Flagship ends in 3 days');
    expect(ended.subject).toContain('has ended');
  });

  it('never lets a mail failure reach the caller', async () => {
    const { mailer, emailService } = createMailer();
    emailService.send.mockRejectedValue(new Error('queue down'));
    await expect(mailer.paymentSubmitted(claim)).resolves.toBeUndefined();
  });

  it('escapes what a customer typed before it reaches an HTML email', () => {
    const { html } = renderBillingEmail({
      subject: 's',
      heading: 'h',
      intro: ['<script>alert(1)</script>'],
      rows: [['Paid from', '<img src=x>']],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });
});
