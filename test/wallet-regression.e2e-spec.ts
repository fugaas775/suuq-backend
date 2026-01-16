import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { WalletService } from '../src/wallet/wallet.service';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/auth/roles.enum';
import { TransactionType } from '../src/wallet/entities/wallet-transaction.entity';

describe('Wallet Regression (e2e)', () => {
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
  });

  afterAll(async () => {
    // Cleanup
    if (user) {
        // Delete wallet transactions first
        const wallet = await walletService.getWallet(user.id);
        if (wallet) {
            await dataSource.getRepository('WalletTransaction').delete({ wallet: { id: wallet.id } });
            await dataSource.getRepository('TopUpRequest').delete({ user: { id: user.id } });
            await dataSource.getRepository('Wallet').delete(wallet.id);
        }
        await dataSource.manager.delete(User, user.id);
    }
    await app.close();
  });

  it('should handle wallet currency migration and balance recalculation correctly', async () => {
    // 1. Create a test user with ETB preference
    const userRepository = dataSource.getRepository(User);
    const email = `test-wallet-reg-${Date.now()}@example.com`;
    user = userRepository.create({
      email,
      password: 'password123',
      displayName: 'Test User',
      phoneNumber: `+251${Date.now().toString().slice(-9)}`,
      roles: [UserRole.CUSTOMER],
      verified: true,
      currency: 'ETB',
      registrationCountry: 'ET',
    });
    await userRepository.save(user);

    // 2. Initialize Wallet (should be ETB)
    let wallet = await walletService.getWallet(user.id);
    expect(wallet.currency).toBe('ETB');
    expect(Number(wallet.balance)).toBe(0);

    // 3. Add transactions in ETB
    // Deposit 1000 ETB
    await walletService.requestTopUp(user.id, 1000, 'TELEBIRR', 'REF123'); // Changed to TELEBIRR for context
    
    // Simulating a Deposit of 1000 ETB
    wallet.balance = 1000;
    await dataSource.getRepository('Wallet').save(wallet);

    const txRepo = dataSource.getRepository('WalletTransaction');
    await txRepo.save({
        wallet,
        type: TransactionType.DEPOSIT,
        amount: 1000,
        description: 'Initial Deposit', 
    });

    // Simulating a Payment of 200 ETB
    await walletService.debitWallet(user.id, 200, TransactionType.PAYMENT, 'Test Payment');
    
    wallet = await walletService.getWallet(user.id);
    expect(Number(wallet.balance)).toBe(800); // 1000 - 200
    expect(wallet.currency).toBe('ETB');

    // 4. Change User preference to KES
    user.currency = 'KES';
    await userRepository.save(user);

    // 5. Trigger Migration by calling getWallet
    console.log('Triggering migration...');
    wallet = await walletService.getWallet(user.id);

    // 6. Verify Migration
    expect(wallet.currency).toBe('KES');
    
    // Expected Rate: 1 ETB = (128.95 / 184) KES
    const conversionRate = 128.95 / 184;
    const expectedBalance = 800 * conversionRate;
    
    console.log(`Expected Balance (approx): ${expectedBalance}`);
    console.log(`Actual Balance: ${wallet.balance}`);

    // Allow some small precision difference
    expect(Number(wallet.balance)).toBeCloseTo(expectedBalance, 1);

    // Verify transactions were converted
    const transactions = await walletService.getTransactions(user.id);
    
    const depositTx = transactions.find(t => t.description === 'Initial Deposit');
    expect(Number(depositTx.amount)).toBeCloseTo(1000 * conversionRate, 1); // was 1000 ETB

    const paymentTx = transactions.find(t => t.type === TransactionType.PAYMENT && t.description === 'Test Payment');
    expect(Number(paymentTx.amount)).toBeCloseTo(-200 * conversionRate, 1); // was -200 ETB

    // 7. Test debitWallet in new currency
    // Debit 100 KES
    const balanceBefore = Number(wallet.balance);
    await walletService.debitWallet(user.id, 100, TransactionType.PAYMENT, 'Test Payment KES');
    
    wallet = await walletService.getWallet(user.id);
    expect(Number(wallet.balance)).toBeCloseTo(balanceBefore - 100, 2); 
    expect(wallet.currency).toBe('KES');

  });
});
