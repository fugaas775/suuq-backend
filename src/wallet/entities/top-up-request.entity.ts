import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum TopUpStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('top_up_request')
export class TopUpRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column()
  method!: string; // e.g., 'BANK_TRANSFER'

  @Column()
  reference!: string; // Transaction reference

  @Column({
    type: 'enum',
    enum: TopUpStatus,
    default: TopUpStatus.PENDING,
  })
  status!: TopUpStatus;

  @ManyToOne(() => User, { eager: true })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
