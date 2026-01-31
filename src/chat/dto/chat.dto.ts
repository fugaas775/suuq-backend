import {
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { MessageType } from '../entities/message.entity';

export class StartConversationDto {
  @IsInt()
  @IsOptional()
  productId?: number;

  @IsInt()
  @IsOptional()
  orderId?: number;

  @IsString()
  @IsNotEmpty()
  initialMessage!: string;

  @IsOptional()
  autoOffer?: boolean;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;
}

export class CreateOfferDto {
  @IsInt()
  productId!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  @IsOptional()
  currency?: string;
}
