// src/deliveries/delivery.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, UpdateDateColumn, } from 'typeorm'; import { Order } from '../orders/order.entity'; import { User } from '../users/user.entity';

@Entity() export class Delivery { @PrimaryGeneratedColumn() id!: number;

@ManyToOne(() => Order, { eager: true, onDelete: 'CASCADE' }) order!: Order;

@ManyToOne(() => User, { eager: true }) deliverer!: User;

@Column({ default: 'ASSIGNED' }) status!: 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED';

@CreateDateColumn() createdAt!: Date;

@UpdateDateColumn() updatedAt!: Date; }
