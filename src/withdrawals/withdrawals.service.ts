import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Withdrawal } from './entities/withdrawal.entity';

@Injectable()
export class WithdrawalsService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepository: Repository<Withdrawal>,
  ) {}

  getPayoutMethods() {
    // Return static list for now, can be enhanced to filter by currency
    return [
      {
        id: 'BANK_TRANSFER',
        name: 'Bank Transfer',
        enabled: true,
        currencies: ['ETB', 'USD'],
      },
      {
        id: 'TELEBIRR',
        name: 'Telebirr',
        enabled: true,
        currencies: ['ETB'],
      },
    ];
  }
}
