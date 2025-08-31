import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity'; // <-- FIXED IMPORT PATH

@Entity()
export class UserSettings {
  @PrimaryGeneratedColumn()
  id!: number;

  // Each user has a single settings record; settings deleted if user is deleted
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;

  // Restrict theme to 'light' or 'dark'
  @Column({ type: 'enum', enum: ['light', 'dark'], default: 'light' })
  theme!: 'light' | 'dark';

  @Column({ default: true })
  notificationsEnabled!: boolean;
}
