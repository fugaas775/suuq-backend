import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column('decimal')
  price!: number;

  @Column({ nullable: true })
  description!: string;

  @ManyToOne(() => User, (user) => user.products, { eager: true })
  @JoinColumn({ name: 'vendorId' }) // Explicit FK column
  vendor!: User;
}

