import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class EbirrTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  merch_order_id!: string; // REF-{id} or Suuq_...

  @Column({ nullable: true })
  invoiceId?: string;

  @Column({ nullable: true })
  trans_id?: string; // From Ebirr parameter 'transactionId' (if we get it in callback)

  @Column({ nullable: true })
  issuer_trans_id?: string; // issuerTransactionId from Ebirr

  @Column({ default: 'PENDING' })
  status!: string; // PENDING, INITIATED, SUCCESS, FAILED, ERROR

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column({ nullable: true })
  currency?: string;

  @Column({ nullable: true })
  payer_name?: string;

  @Column({ nullable: true })
  payer_account?: string;

  @Column({ nullable: true })
  req_transaction_id?: string;

  @Column({ nullable: true })
  request_timestamp?: string;

  @Column('simple-json', { nullable: true })
  raw_request_payload?: any;

  @Column('simple-json', { nullable: true })
  raw_response_payload?: any;

  @Column({ nullable: true })
  response_code?: string;

  @Column({ nullable: true })
  response_msg?: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
