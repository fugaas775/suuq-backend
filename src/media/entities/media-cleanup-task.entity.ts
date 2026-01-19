import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('media_cleanup_task')
export class MediaCleanupTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 512 })
  @Index()
  key!: string; // The S3 Key to delete

  @Column({ name: 'reason_type', type: 'varchar', length: 50, nullable: true })
  reasonType?: string; // e.g. "product_delete"

  @Column({ name: 'reason_id', type: 'varchar', length: 50, nullable: true })
  reasonId?: string; // e.g. product ID (as string)

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
