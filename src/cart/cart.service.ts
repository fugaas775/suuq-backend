import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem } from './entities/cart.entity';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { SyncCartDto } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async findCartForUser(user: User): Promise<Cart> {
    let cart = await this.cartRepository.findOne({ where: { user: { id: user.id } } });
    if (!cart) {
      cart = this.cartRepository.create({ user, items: [] });
      await this.cartRepository.save(cart);
    }
    return cart;
  }
  
  async syncCart(user: User, syncCartDto: SyncCartDto): Promise<Cart> {
    const cart = await this.findCartForUser(user);

    for (const guestItem of syncCartDto.items) {
      const product = await this.productRepository.findOneBy({ id: guestItem.productId });
      if (!product) continue; // Skip if product doesn't exist

      const existingItem = cart.items.find(item => item.product.id === guestItem.productId);

      if (existingItem) {
        // If item exists, add quantities
        existingItem.quantity += guestItem.quantity;
      } else {
        // If item does not exist, create a new one
        const newCartItem = new CartItem();
        newCartItem.product = product;
        newCartItem.quantity = guestItem.quantity;
        newCartItem.cart = cart;
        cart.items.push(newCartItem);
      }
    }
    return this.cartRepository.save(cart);
  }

  async addItem(user: User, productId: number, quantity: number): Promise<Cart> {
    const cart = await this.findCartForUser(user);
    const product = await this.productRepository.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    const existingItem = cart.items.find(item => item.product.id === productId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      const newItem = new CartItem();
      newItem.product = product;
      newItem.quantity = quantity;
      cart.items.push(newItem);
    }
    return this.cartRepository.save(cart);
  }

  async removeItem(user: User, productId: number): Promise<Cart> {
    const cart = await this.findCartForUser(user);
    cart.items = cart.items.filter(item => item.product.id !== productId);
    return this.cartRepository.save(cart);
  }

  async updateQuantity(user: User, productId: number, quantity: number): Promise<Cart> {
    const cart = await this.findCartForUser(user);
    const itemToUpdate = cart.items.find(item => item.product.id === productId);
    
    if (!itemToUpdate) throw new NotFoundException('Item not found in cart');

    if (quantity <= 0) {
      cart.items = cart.items.filter(item => item.product.id !== productId);
    } else {
      itemToUpdate.quantity = quantity;
    }
    return this.cartRepository.save(cart);
  }

  async clearCart(user: User): Promise<Cart> {
    const cart = await this.findCartForUser(user);
    cart.items = [];
    return this.cartRepository.save(cart);
  }
}