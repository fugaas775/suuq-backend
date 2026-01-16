import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
  SYSTEM = 'SYSTEM',
  ORDER = 'ORDER',
  PROMOTION = 'PROMOTION',
  ACCOUNT = 'ACCOUNT',
}

@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE' })
  recipient: User;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ default: false })
  isRead: boolean;

  @Index()
  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
