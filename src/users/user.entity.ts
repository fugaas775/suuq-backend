import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { forwardRef } from '@nestjs/common';
import { MediaEntity } from '../media/media.entity';
import { Product } from '../products/entities/product.entity';

export type UserRole = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'DELIVERER';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column({ type: 'varchar' })
  role!: UserRole;

  @OneToMany(() => Product, (product) => product.vendor)
  products!: Product[];

  @OneToMany(() => MediaEntity, (media) => media.owner)
  media!: MediaEntity[];


  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  avatarUrl?: string;
}

