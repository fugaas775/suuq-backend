import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { WalletService } from '../src/wallet/wallet.service';
import { User, SubscriptionTier } from '../src/users/entities/user.entity';
import { UserRole } from '../src/auth/roles.enum';
import { UiSetting } from '../src/settings/entities/ui-setting.entity';

describe('Auto Upgrade Workflow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let walletService: WalletService;
  let user: User;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    dataSource = app.get(DataSource);
    walletService = app.get(WalletService);

    // Ensure Price is set (Mocking the seed)
    const settingRepo = dataSource.getRepository(UiSetting);
    let priceSetting = await settingRepo.findOne({ where: { key: 'vendor_subscription_base_price' } });
    if (!priceSetting) {
        priceSetting = settingRepo.create({
            key: 'vendor_subscription_base_price',
            value: 9.99,
            description: 'Test Price'
        });
        await settingRepo.save(priceSetting);
    }
  });

  afterAll(async () => {
    // Cleanup
    if (user) {
        const wallet = await walletService.getWallet(user.id);
        if (wallet) {
             // Clean using query runner or raw delete to avoid FK constraints
             await dataSource.query(`DELETE FROM wallet_transaction WHERE "walletId" = ${wallet.id}`);
             await dataSource.query(`DELETE FROM top_up_request WHERE "userId" = ${user.id}`);
             await dataSource.query(`DELETE FROM wallet WHERE id = ${wallet.id}`);
        }
        await dataSource.query(`DELETE FROM "user" WHERE id = ${user.id}`);
    }
    await app.close();
  });

  it('should automatically upgrade user to PRO when Top-Up with metadata is approved', async () => {
    // 1. Create a User (ETB)
    const userRepository = dataSource.getRepository(User);
    const email = `test-auto-upgrade-${Date.now()}@example.com`;
    user = userRepository.create({
      email,
      password: 'password123',
      displayName: 'Auto Upgrade Tester',
      phoneNumber: `+251${Date.now().toString().slice(-9)}`,
      roles: [UserRole.VENDOR],
      verified: true,
      currency: 'ETB',
      registrationCountry: 'ET',
      subscriptionTier: SubscriptionTier.FREE 
    });
    await userRepository.save(user);

    console.log(`[Test] Created User: ${user.email} (ID: ${user.id})`);
    expect(user.subscriptionTier).toBe(SubscriptionTier.FREE);

    // 2. Client: Request Top-Up with Metadata
    // Amount: 2500 ETB (Needs to covers $9.99 USD approx 1800-2000 ETB)
    const topUpAmount = 2500;
    const request = await walletService.requestTopUp(
        user.id,
        topUpAmount,
        'BANK_TRANSFER',
        'REF_AUTO_TEST',
        { auto_action: 'upgrade_pro' } // The Magic Key
    );
    console.log(`[Test] Created TopUp Request: ${request.id}`);

    // 3. Admin: Approve Top-Up
    console.log('[Test] Approving Request...');
    await walletService.approveTopUp(request.id);

    // 4. Verify Outcomes
    
    // A. Wallet Balance should be: TopUp Amount - Subscription Price
    // We need to fetch the wallet
    const wallet = await walletService.getWallet(user.id);
    console.log(`[Test] Wallet Balance: ${wallet.balance} ${wallet.currency}`);

    // It should NOT be 2500. It should be less.
    expect(Number(wallet.balance)).toBeLessThan(topUpAmount); 
    expect(Number(wallet.balance)).toBeGreaterThan(0);

    // B. User Subscription should be PRO
    const updatedUser = await userRepository.findOne({ where: { id: user.id } });
    console.log(`[Test] User Tier: ${updatedUser.subscriptionTier}`);
    
    expect(updatedUser.subscriptionTier).toBe(SubscriptionTier.PRO);
    expect(updatedUser.subscriptionExpiry).not.toBeNull();
  });
});
