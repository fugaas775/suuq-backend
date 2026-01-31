import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ForwardChannel } from '../../product-requests/dto/admin-forward-product-request.dto';

export class AdminForwardToAllVerifiedDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsOptional()
  @IsEnum(ForwardChannel)
  channel?: ForwardChannel;
}
