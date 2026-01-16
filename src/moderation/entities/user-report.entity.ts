import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

@Entity()
export class UserReport {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: false })
  @Index()
  reporter: User;

  @ManyToOne(() => Product, { nullable: false, onDelete: 'CASCADE' })
  @Index()
  product: Product;

  @Column()
  reason: string; // e.g., "Prohibited Item", "Scam/Fraud"

  @Column({ type: 'text', nullable: true })
  details?: string;

  @Column({ default: 'pending' }) // pending, reviewed, dismissed
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
