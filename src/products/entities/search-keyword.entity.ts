import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('search_keyword')
export class SearchKeyword {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 256 })
  q!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 256, name: 'q_norm' })
  qNorm!: string;

  @Column({ type: 'int', default: 0, name: 'total_count' })
  totalCount!: number;

  @Column({ type: 'int', default: 0, name: 'suggest_count' })
  suggestCount!: number;

  @Column({ type: 'int', default: 0, name: 'submit_count' })
  submitCount!: number;

  @Column({ type: 'int', nullable: true, name: 'last_results' })
  lastResults?: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'last_ip' })
  lastIp?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true, name: 'last_ua' })
  lastUa?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'last_city' })
  lastCity?: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true, name: 'last_country' })
  lastCountry?: string | null;

  @Column({
    type: 'varchar',
    length: 256,
    nullable: true,
    name: 'last_vendor_name',
  })
  lastVendorName?: string | null;

  // Distribution of vendors that appeared in the search results for this keyword (last submit)
  // Example: [{ name: 'Acme', id: 123, country: 'KE', count: 4 }]
  @Column({ type: 'jsonb', nullable: true, name: 'vendor_hits' })
  vendorHits?: Array<{
    name: string;
    id?: number;
    country?: string;
    count: number;
  }> | null;

  @Column({ type: 'int', default: 0, name: 'zero_results_count' })
  zeroResultsCount!: number;

  @Column({ type: 'timestamp', nullable: true, name: 'last_zero_results_at' })
  lastZeroResultsAt?: Date | null;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    name: 'last_zero_results_city',
  })
  lastZeroResultsCity?: string | null;

  @Column({
    type: 'varchar',
    length: 2,
    nullable: true,
    name: 'last_zero_results_country',
  })
  lastZeroResultsCountry?: string | null;

  @CreateDateColumn({ name: 'first_seen_at' })
  firstSeenAt!: Date;

  @UpdateDateColumn({ name: 'last_seen_at' })
  lastSeenAt!: Date;
}
