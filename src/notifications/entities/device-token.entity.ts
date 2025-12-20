import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('device_tokens')
@Index(['token'], { unique: true })
export class DeviceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @Column()
  token: string;

  @Column({ default: 'unknown' })
  platform: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
