import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { Message } from './message.entity';

import { Order } from '../../orders/entities/order.entity';

@Entity()
@Index(['buyer', 'vendor', 'product'], { unique: true, where: '"productId" IS NOT NULL' }) // Product Chat
@Index(['buyer', 'deliverer', 'order'], { unique: true, where: '"orderId" IS NOT NULL AND "buyerId" IS NOT NULL' }) // Customer-Deliverer Chat
@Index(['vendor', 'deliverer', 'order'], { unique: true, where: '"orderId" IS NOT NULL AND "vendorId" IS NOT NULL' }) // Vendor-Deliverer Chat
export class Conversation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { nullable: true, eager: true })
  buyer?: User;

  @ManyToOne(() => User, { nullable: true, eager: true })
  vendor?: User;

  @ManyToOne(() => User, { nullable: true, eager: true })
  deliverer?: User;

  @ManyToOne(() => Product, { nullable: true, eager: true })
  product?: Product;

  @ManyToOne(() => Order, { nullable: true, eager: true })
  order?: Order;

  @OneToMany(() => Message, (message) => message.conversation)
  messages!: Message[];

  @Column({ nullable: true })
  lastMessage?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
