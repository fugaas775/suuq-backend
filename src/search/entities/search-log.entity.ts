import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'search_log' })
@Index('idx_search_log_query', ['query'])
export class SearchLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 256 })
  query!: string;

  @Column({ type: 'int', name: 'result_count', default: 0 })
  resultCount!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source?: string | null;

  @Column({ type: 'int', name: 'category_id', nullable: true })
  categoryId?: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  city?: string | null;

  @Column({ type: 'int', name: 'user_id', nullable: true })
  userId?: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'ip_address' })
  ipAddress?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true, name: 'user_agent' })
  userAgent?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
