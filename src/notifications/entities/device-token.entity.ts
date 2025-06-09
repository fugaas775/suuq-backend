import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity()
@Unique(['user', 'token'])
export class DeviceToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  token!: string;

  @ManyToOne(() => User, (user: User) => user.deviceTokens, { onDelete: 'CASCADE' })
  user!: User;
}