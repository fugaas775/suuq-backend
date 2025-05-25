import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column('decimal')
  price!: number;

  @Column()
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, user => user.products, { eager: false })
  vendor!: User;

}
