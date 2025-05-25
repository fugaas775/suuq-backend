import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity'; // Adjust path if needed

@Entity()
export class UserSettings {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;

  @Column({ default: 'light' })
  theme!: 'light' | 'dark';

  @Column({ default: true })
  notificationsEnabled!: boolean;
}
