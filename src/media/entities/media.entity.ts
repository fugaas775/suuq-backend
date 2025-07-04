import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

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

  @Column({ default: 'product' })
  type!: string;

  @Column({ nullable: true })
  caption?: string;

  @Column({ nullable: true })
  altText?: string;

  @ManyToOne(() => User, (user) => user.media, { eager: false })
  @JoinColumn({ name: 'ownerId' })
  owner!: User;
}
