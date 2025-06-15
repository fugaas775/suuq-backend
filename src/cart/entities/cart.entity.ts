// src/cart/entities/cart.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
  Column,
  ManyToOne,
} from 'typeorm';

// We DO NOT import User or Product here to break the dependency cycle.

@Entity()
export class CartItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne('Cart', (cart: any) => cart.items, { onDelete: 'CASCADE' })
  cart!: any; // Using 'any' because the Cart type isn't imported

  // FIX: Using string 'Product' for the relation
  @ManyToOne('Product', { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  product!: any; // Using 'any' because the Product type isn't imported

  @Column()
  quantity!: number;
}

@Entity()
export class Cart {
  @PrimaryGeneratedColumn()
  id!: number;

  // FIX: Using string 'User' for the relation
  @OneToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: any; // Using 'any' because the User type isn't imported

  @OneToMany('CartItem', (item: CartItem) => item.cart, {
    cascade: true,
    eager: true,
  })
  items!: CartItem[];
}