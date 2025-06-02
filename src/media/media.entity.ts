import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { forwardRef } from '@nestjs/common';
import { User } from '../users/user.entity';

@Entity('media')
export class MediaEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  key!: string;

  @Column()
  src!: string;

  @Column()
  mimeType!: string;

  @Column()
  fileName!: string;

  @Column()
  ownerId!: number;

  @ManyToOne(() => User, (user) => user.media, { eager: false })
  @JoinColumn({ name: 'ownerId' })
  owner!: User;
}
