// src/notifications/device-token.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique } from 'typeorm';
import { User } from '../users/user.entity';

@Entity()
@Unique(['user', 'token'])
export class DeviceToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  token!: string;

  @ManyToOne(() => User, user => user.deviceTokens, { onDelete: 'CASCADE' })
  user!: User;
}