import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import {
  StartConversationDto,
  SendMessageDto,
  CreateOfferDto,
} from './dto/chat.dto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { UserRole } from '../auth/roles.enum';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('start')
  async startConversation(
    @Body() dto: StartConversationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const roles = (
      typeof req.user.roles === 'string'
        ? [req.user.roles]
        : req.user.roles || []
    ) as UserRole[];
    return this.chatService.startConversation(
      req.user.id,
      {
        productId: dto.productId,
        orderId: dto.orderId,
        initialMessage: dto.initialMessage,
        autoOffer: dto.autoOffer,
      },
      roles,
    );
  }

  @Get()
  async getConversations(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: 'buying' | 'selling' | 'logistics',
  ) {
    return this.chatService.getConversations(req.user.id, type);
  }

  @Get(':id/messages')
  async getMessages(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.getMessages(id, req.user.id);
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.sendMessage(id, req.user.id, dto.content, dto.type);
  }

  @Post(':id/offer')
  async createOffer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOfferDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.createOffer(id, req.user.id, dto);
  }
}
