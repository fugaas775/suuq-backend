import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['productId', 'sessionKey'])
export class ProductImpression {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('int')
  productId!: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  country?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  city?: string;

  @Column({ type: 'varchar', length: 128 })
  sessionKey!: string; // derived from IP + UA + optional client sessionId

  @CreateDateColumn()
  createdAt!: Date;
}
