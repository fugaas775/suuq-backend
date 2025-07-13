import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem } from './entities/cart.entity';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async getCart(userId: number): Promise<Cart> {
    let cart = await this.cartRepository.findOne({ where: { user: { id: userId } } });
    if (!cart) {
      cart = this.cartRepository.create({ user: { id: userId }, items: [] });
      await this.cartRepository.save(cart);
    }
    return cart;
  }

  async addItem(userId: number, productId: number, quantity: number): Promise<Cart> {
    const cart = await this.getCart(userId);
    const product = await this.productRepository.findOneBy({ id: productId });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existingItem = cart.items.find(item => item.product.id === productId);

    if (existingItem) {
      existingItem.quantity += quantity;
      await this.cartItemRepository.save(existingItem);
    } else {
      const newItem = this.cartItemRepository.create({ cart, product, quantity });
      await this.cartItemRepository.save(newItem);
    }
    
    // Return the updated cart
    return this.getCart(userId);
  }

  async updateItemQuantity(userId: number, productId: number, quantity: number): Promise<Cart> {
    const cart = await this.getCart(userId);
    const itemToUpdate = cart.items.find(item => item.product.id === productId);

    if (!itemToUpdate) {
      throw new NotFoundException('Item not found in cart');
    }

    itemToUpdate.quantity = quantity;
    await this.cartItemRepository.save(itemToUpdate);
    return this.getCart(userId);
  }

  async removeItem(userId: number, productId: number): Promise<Cart> {
    const cart = await this.getCart(userId);
    const itemToRemove = cart.items.find(item => item.product.id === productId);

    if (!itemToRemove) {
      throw new NotFoundException('Item not found in cart');
    }
    
    await this.cartItemRepository.remove(itemToRemove);
    return this.getCart(userId);
  }

  async clearCart(userId: number): Promise<Cart> {
    const cart = await this.getCart(userId);
    await this.cartItemRepository.remove(cart.items);
    return this.getCart(userId);
  }
}
