import { IsInt, IsOptional, IsString, IsNotEmpty } from 'class-validator';

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
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}
