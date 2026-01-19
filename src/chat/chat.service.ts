import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../auth/roles.enum';
import { Order } from '../orders/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async startConversation(
    userId: number,
    data: { productId?: number; orderId?: number; initialMessage: string },
    userRoles: UserRole[] = [],
  ): Promise<Conversation> {
    if (data.productId) {
      return this.startProductChat(userId, data.productId, data.initialMessage);
    }
    if (data.orderId) {
      return this.startOrderChat(userId, data.orderId, data.initialMessage, userRoles);
    }
    throw new ForbiddenException('Invalid conversation parameters');
  }

  private async startProductChat(buyerId: number, productId: number, initialMessage: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['vendor'],
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id === buyerId) {
      throw new ForbiddenException('Cannot chat with yourself');
    }

    let conversation = await this.conversationRepo.findOne({
      where: {
        buyer: { id: buyerId },
        vendor: { id: product.vendor.id },
        product: { id: productId },
      },
    });

    if (!conversation) {
      conversation = this.conversationRepo.create({
        buyer: { id: buyerId },
        vendor: { id: product.vendor.id },
        product: product,
      });
      conversation = await this.conversationRepo.save(conversation);
    }

    await this.sendMessage(conversation.id, buyerId, initialMessage);

    return conversation;
  }

  private async startOrderChat(userId: number, orderId: number, initialMessage: string, _roles: UserRole[]) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'deliverer', 'items', 'items.product', 'items.product.vendor'],
    });
    if (!order) throw new NotFoundException('Order not found');

    const isDeliverer = order.deliverer?.id === userId;
    const isBuyer = order.user.id === userId;
    // For simplicity, pick the first vendor of the order (multi-vendor orders might split, but let's assume one or main)
    // Actually, if an order has multiple vendors, the 'Order' entity usually links to ONE checkout. 
    // If the system splits sub-orders, we should chat on sub-orders.
    // Assuming 'Order' here might contain items from ONE vendor if the checkout splits. 
    // Let's check if the user is a vendor of any item.
    const vendorId = order.items?.[0]?.product?.vendor?.id;
    const isVendor = vendorId === userId;

    if (!isDeliverer && !isBuyer && !isVendor) {
      throw new ForbiddenException('You are not a participant of this order');
    }

    // Determine Counterparty.
    // If Deliverer starts:
    //   - If explicitly wants to chat with Buyer?
    //   - If explicitly wants to chat with Vendor?
    // Current DTO doesn't specify "target".
    // Let's implement smart routing or require target?
    // Smart routing: 
    //   - Deliverer -> Buyer (most common: "I'm here")
    //   - Buyer -> Deliverer ("Where are you?")
    //   - Vendor -> Deliverer ("Ready for pickup")
    //   - Deliverer -> Vendor ("I'm at the shop")
    
    // Simplest approach: Use roles to decide or create TWO conversations if specific.
    // But better: Just default to Buyer-Deliverer if Buyer/Deliverer involved. 
    // Vendor-Deliverer is less common in some apps (usually automated status), but useful.
    
    // Let's assume Order Chat is Deliverer <-> Customer for now (most requested feature).
    // If user is Vendor, they might want to chat with Deliverer.
    
    // Let's determine the pair based on WHO is initiating.
    let buyerState: User | undefined;
    let vendorState: User | undefined;
    let delivererState: User | undefined;

    if (isDeliverer) {
      // Deliverer initiating. Default to Customer (Buyer).
      // TODO: Add support for target selection. For now, Customer is priority.
       buyerState = order.user;
       delivererState = order.deliverer!;
    } else if (isBuyer) {
       // Buyer initiating. Chat with Deliverer if assigned.
       if (!order.deliverer) throw new ForbiddenException('No deliverer assigned yet');
       buyerState = order.user;
       delivererState = order.deliverer;
    } else if (isVendor) {
       // Vendor initiating. Chat with Deliverer.
       if (!order.deliverer) throw new ForbiddenException('No deliverer assigned yet');
       vendorState = order.items[0].product.vendor;
       delivererState = order.deliverer;
    }

    // Find existing
    const criteria: any = { order: { id: orderId } };
    if (buyerState) criteria.buyer = { id: buyerState.id };
    if (vendorState) criteria.vendor = { id: vendorState.id };
    if (delivererState) criteria.deliverer = { id: delivererState.id };

    let conversation = await this.conversationRepo.findOne({ where: criteria });

    if (!conversation) {
      conversation = this.conversationRepo.create({
        order,
        buyer: buyerState,
        vendor: vendorState,
        deliverer: delivererState
      });
      conversation = await this.conversationRepo.save(conversation);
    }

    await this.sendMessage(conversation.id, userId, initialMessage);
    return conversation;
  }

  async sendMessage(
    conversationId: number,
    senderId: number,
    content: string,
  ): Promise<Message> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['buyer', 'vendor', 'deliverer', 'product', 'order'],
    });

    if (!conversation) throw new NotFoundException('Conversation not found');

    // Check participation
    const isBuyer = conversation.buyer?.id === senderId;
    const isVendor = conversation.vendor?.id === senderId;
    const isDeliverer = conversation.deliverer?.id === senderId;

    if (!isBuyer && !isVendor && !isDeliverer) {
      throw new ForbiddenException('Not a participant');
    }

    const message = this.messageRepo.create({
      conversation,
      sender: { id: senderId },
      content,
    });

    await this.messageRepo.save(message);

    // Update conversation metadata
    conversation.lastMessage = content;
    conversation.lastMessageAt = new Date();
    await this.conversationRepo.save(conversation);

    // Notify the other party
    // Logic updated to handle Deliverer
    const recipients: User[] = [];
    
    // Product Chat: Buyer <-> Vendor
    if (conversation.product) {
       if (conversation.buyer.id !== senderId) recipients.push(conversation.buyer);
       if (conversation.vendor.id !== senderId) recipients.push(conversation.vendor);
    } 
    // Order Chat: Buyer <-> Deliverer OR Vendor <-> Deliverer
    else if (conversation.order) {
       if (conversation.buyer && conversation.buyer.id !== senderId) recipients.push(conversation.buyer);
       if (conversation.vendor && conversation.vendor.id !== senderId) recipients.push(conversation.vendor);
       if (conversation.deliverer && conversation.deliverer.id !== senderId) recipients.push(conversation.deliverer);
    }

    const senderName = conversation.buyer?.id === senderId ? 'Customer' : 
                       conversation.deliverer?.id === senderId ? 'Deliverer' : 'Vendor';

    for (const recipient of recipients) {
      await this.notificationsService.sendToUser({
        userId: recipient.id,
        title: `New Message from ${senderName}`,
        body: content,
        data: {
          type: 'chat_message',
          conversationId: String(conversationId),
          productId: conversation.product?.id ? String(conversation.product.id) : '',
          orderId: conversation.order?.id ? String(conversation.order.id) : '',
        },
      });
    }

    return message;
  }

  async getConversations(userId: number, type: 'buying' | 'selling' | 'logistics' | 'all' = 'all'): Promise<any[]> {
    const whereConditions: any[] = [];
    
    // Determine filters based on type
    if (type === 'all' || type === 'buying') whereConditions.push({ buyer: { id: userId } });
    if (type === 'all' || type === 'selling') whereConditions.push({ vendor: { id: userId } });
    if (type === 'all' || type === 'logistics') whereConditions.push({ deliverer: { id: userId } });

    // If no roles match the filter (e.g. asking for 'selling' but not a vendor), return empty or let it return nothing
    if (whereConditions.length === 0) return [];

    const conversations = await this.conversationRepo.find({
      where: whereConditions,
      order: { lastMessageAt: 'DESC' },
      relations: ['buyer', 'vendor', 'deliverer', 'product', 'order'],
    });

    // Enrich with formatted 'partner' info for the frontend UI
    return conversations.map(c => {
      let partner = { id: 0, name: 'Unknown', avatar: '', role: 'unknown' };
      
      if (c.buyer?.id === userId) {
        // Current user is Buyer
        // Priority: Vendor (Product Chat) > Deliverer (Logistics Chat)
        if (c.vendor) {
          partner = {
            id: c.vendor.id,
            name: c.vendor.storeName || c.vendor.displayName || 'Vendor',
            avatar: c.vendor.avatarUrl || '',
            role: 'vendor'
          };
        } else if (c.deliverer) {
           partner = {
            id: c.deliverer.id,
            name: c.deliverer.displayName || 'Deliverer',
            avatar: c.deliverer.avatarUrl || '',
            role: 'deliverer'
          };
        }
      } else if (c.vendor?.id === userId) {
        // Current user is Vendor
        // Priority: Buyer (Product Chat) > Deliverer (Logistics Chat)
        if (c.buyer) {
           partner = {
            id: c.buyer.id,
            name: c.buyer.displayName || 'Customer',
            avatar: c.buyer.avatarUrl || '',
            role: 'buyer'
          };
        } else if (c.deliverer) {
           partner = {
            id: c.deliverer.id,
            name: c.deliverer.displayName || 'Deliverer',
            avatar: c.deliverer.avatarUrl || '',
            role: 'deliverer'
          };
        }
      } else if (c.deliverer?.id === userId) {
         // Current user is Deliverer
         // Usually coordinating with Vendor for pickup or Buyer for dropoff.
         // Default to showing the Vendor as the primary context, or Buyer if Vendor is null
         const target = c.vendor || c.buyer;
         partner = {
          id: target?.id || 0,
          name: target?.storeName || target?.displayName || 'Contact',
          avatar: target?.avatarUrl || '',
          role: c.vendor ? 'vendor' : 'buyer'
        };
      }

      return {
        ...c,
        partner
      };
    });
  }

  async getMessages(conversationId: number, userId: number): Promise<Message[]> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['buyer', 'vendor', 'deliverer'],
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    
    const isParticipant = 
       (conversation.buyer?.id === userId) || 
       (conversation.vendor?.id === userId) || 
       (conversation.deliverer?.id === userId);

    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    return this.messageRepo.find({
      where: { conversation: { id: conversationId } },
      order: { createdAt: 'ASC' },
      relations: ['sender'],
    });
  }
}
