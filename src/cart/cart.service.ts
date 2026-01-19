import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem } from './entities/cart.entity';
import { Product } from '../products/entities/product.entity';
import { CurrencyService } from '../common/services/currency.service';
import { Logger } from '@nestjs/common';

type PriceDisplay = {
  amount: number | null;
  currency: string;
  convertedFrom: string;
  rate?: number;
};
type ProductWithDisplay = Product & {
  price_display?: PriceDisplay;
  sale_price_display?: PriceDisplay;
};
type CartItemWithDisplay = CartItem & {
  product: ProductWithDisplay;
  subtotal_display?: PriceDisplay;
};
type CartWithDisplay = Cart & {
  items: CartItemWithDisplay[];
  currency?: string;
  total_display?: PriceDisplay;
};

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private readonly supportedCurrencies = ['ETB', 'SOS', 'KES', 'DJF', 'USD'];

  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly currencyService: CurrencyService,
  ) {}

  private normalizeCurrency(value?: string | null): string {
    const upper = (value || '').trim().toUpperCase();
    return this.supportedCurrencies.includes(upper) ? upper : 'ETB';
  }

  private convertPrice(
    amount: number | null | undefined,
    fromCurrency: string,
    toCurrency: string,
  ): { amount: number | null; rate?: number } {
    if (amount === null || amount === undefined) return { amount: null };
    try {
      const converted = this.currencyService.convert(
        amount,
        fromCurrency,
        toCurrency,
      );
      const rate = this.currencyService.getRate(fromCurrency, toCurrency);
      return {
        amount: converted,
        rate:
          typeof rate === 'number'
            ? Math.round(rate * 1_000_000) / 1_000_000
            : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `Currency convert failed from ${fromCurrency} to ${toCurrency}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { amount, rate: undefined };
    }
  }

  private mapCartItem(
    item: CartItem,
    targetCurrency: string,
  ): CartItemWithDisplay {
    if (!item?.product) return item as CartItemWithDisplay;
    const itemWithDisplay = item as CartItemWithDisplay;
    const product = itemWithDisplay.product;
    const from = product.currency || 'ETB';
    const { amount: priceConverted, rate } = this.convertPrice(
      product.price,
      from,
      targetCurrency,
    );
    const { amount: saleConverted } = this.convertPrice(
      product.sale_price,
      from,
      targetCurrency,
    );
    const unit = priceConverted ?? product.price ?? 0;
    const subtotal = Math.round(unit * (item.quantity || 0) * 100) / 100;

    itemWithDisplay.product.price_display = {
      amount: priceConverted ?? product.price ?? null,
      currency: targetCurrency,
      convertedFrom: from,
      rate,
    };
    if (saleConverted !== null && saleConverted !== undefined) {
      itemWithDisplay.product.sale_price_display = {
        amount: saleConverted,
        currency: targetCurrency,
        convertedFrom: from,
        rate,
      };
    }
    itemWithDisplay.subtotal_display = {
      amount: subtotal,
      currency: targetCurrency,
      convertedFrom: from,
      rate,
    };
    itemWithDisplay.product.price = priceConverted ?? product.price;
    itemWithDisplay.product.sale_price = saleConverted ?? product.sale_price;
    itemWithDisplay.product.currency = targetCurrency;
    return itemWithDisplay;
  }

  private mapCart(cart: Cart, currency?: string): CartWithDisplay {
    const target = this.normalizeCurrency(currency);
    this.logger.debug(
      `Cart currency normalized: requested=${currency} applied=${target}`,
    );
    const cartWithDisplay = cart as CartWithDisplay;
    const mappedItems = (cart.items || []).map((ci) =>
      this.mapCartItem(ci, target),
    );
    cartWithDisplay.items = mappedItems;
    cartWithDisplay.currency = target;
    const total = mappedItems.reduce((sum, it) => {
      const subtotal = it.subtotal_display?.amount;
      return sum + (typeof subtotal === 'number' ? subtotal : 0);
    }, 0);
    cartWithDisplay.total_display = {
      amount: Math.round(total * 100) / 100,
      currency: target,
      convertedFrom: target,
      rate: 1,
    };
    return cartWithDisplay;
  }

  async getCart(userId: number, currency?: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({
      where: { user: { id: userId } },
    });
    if (!cart) {
      cart = this.cartRepository.create({ user: { id: userId }, items: [] });
      await this.cartRepository.save(cart);
    }
    return this.mapCart(cart, currency);
  }

  async addItem(
    userId: number,
    productId: number,
    quantity: number,
    currency?: string,
    attributes: Record<string, any> = {},
  ): Promise<Cart> {
    const cart = await this.getCart(userId, currency);
    const product = await this.productRepository.findOneBy({ id: productId });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Sort keys to ensure consistent stringify comparison
    const attrString = JSON.stringify(attributes || {}, Object.keys(attributes || {}).sort());

    const existingItem = cart.items.find((item) => {
       if (item.product.id !== productId) return false;
       const itemAttrString = JSON.stringify(item.attributes || {}, Object.keys(item.attributes || {}).sort());
       return itemAttrString === attrString;
    });

    if (existingItem) {
      existingItem.quantity += quantity;
      await this.cartItemRepository.save(existingItem);
    } else {
      const newItem = this.cartItemRepository.create({
        cart,
        product,
        quantity,
        attributes: attributes || {},
      });
      await this.cartItemRepository.save(newItem);
    }

    // Return the updated cart
    return this.getCart(userId, currency);
  }

  async updateItemQuantity(
    userId: number,
    productId: number,
    quantity: number,
    currency?: string,
  ): Promise<Cart> {
    const cart = await this.getCart(userId, currency);
    const itemToUpdate = cart.items.find(
      (item) => item.product.id === productId,
    );

    if (!itemToUpdate) {
      throw new NotFoundException('Item not found in cart');
    }

    itemToUpdate.quantity = quantity;
    await this.cartItemRepository.save(itemToUpdate);
    return this.getCart(userId, currency);
  }

  async removeItem(
    userId: number,
    productId: number,
    currency?: string,
  ): Promise<Cart> {
    const cart = await this.getCart(userId, currency);
    const itemToRemove = cart.items.find(
      (item) => item.product.id === productId,
    );

    if (!itemToRemove) {
      throw new NotFoundException('Item not found in cart');
    }

    await this.cartItemRepository.remove(itemToRemove);
    return this.getCart(userId, currency);
  }

  async clearCart(userId: number, currency?: string): Promise<Cart> {
    const cart = await this.getCart(userId, currency);
    await this.cartItemRepository.remove(cart.items);
    return this.getCart(userId, currency);
  }
}
