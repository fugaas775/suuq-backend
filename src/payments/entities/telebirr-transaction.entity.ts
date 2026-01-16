import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class TelebirrTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  merch_order_id!: string; // ORDER-{id}

  @Column({ nullable: true })
  trans_id?: string; // From Telebirr

  @Column({ nullable: true })
  payment_order_id?: string; // From Telebirr (internal ID)

  @Column({ default: 'PENDING' })
  status!: string; // PENDING, PAID, FAILED, DISBURSED

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column({ nullable: true })
  payer_msisdn?: string;

  @Column('text', { nullable: true })
  raw_response?: string; // Store JSON response for audit

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
